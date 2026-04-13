use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("AgntCupXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

#[program]
pub mod agents_cup {
    use super::*;

    // ─── Collection Init (one-time) ─────────────────────────────────────
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.treasury = ctx.accounts.treasury.key();
        config.total_packs_sold = 0;
        config.total_matches = 0;
        config.prize_pool = 0;
        msg!("Agents Cup initialized");
        Ok(())
    }

    // ─── Purchase Pack ──────────────────────────────────────────────────
    pub fn purchase_pack(ctx: Context<PurchasePack>, pack_type: u8) -> Result<()> {
        let price_lamports: u64 = match pack_type {
            0 => 100_000_000,   // 0.1 SOL — Starter
            1 => 250_000_000,   // 0.25 SOL — Pro
            2 => 500_000_000,   // 0.5 SOL — Elite
            3 => 1_000_000_000, // 1.0 SOL — Legendary
            _ => return Err(ErrorCode::InvalidPackType.into()),
        };

        let treasury_amount = price_lamports * 90 / 100;
        let prize_amount = price_lamports - treasury_amount;

        // Transfer to treasury
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            treasury_amount,
        )?;

        // Transfer to prize pool PDA
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.prize_pool.to_account_info(),
                },
            ),
            prize_amount,
        )?;

        // Update config
        let config = &mut ctx.accounts.config;
        config.total_packs_sold += 1;
        config.prize_pool += prize_amount;

        emit!(PackPurchased {
            buyer: ctx.accounts.buyer.key(),
            pack_type,
            amount: price_lamports,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // ─── List Agent on Marketplace ──────────────────────────────────────
    pub fn list_agent(ctx: Context<ListAgent>, price_lamports: u64) -> Result<()> {
        require!(price_lamports > 0, ErrorCode::InvalidPrice);

        let listing = &mut ctx.accounts.listing;
        listing.seller = ctx.accounts.seller.key();
        listing.mint = ctx.accounts.mint.key();
        listing.price = price_lamports;
        listing.created_at = Clock::get()?.unix_timestamp;
        listing.is_active = true;

        // Transfer NFT to escrow PDA (token account owned by listing PDA)
        // The seller sends their token to the escrow_token_account
        let transfer_ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: anchor_lang::solana_program::system_program::id(),
            accounts: vec![],
            data: vec![],
        };
        // NOTE: In production, use SPL Token transfer or Metaplex Core transfer
        // For devnet MVP, the backend tracks ownership in Supabase
        msg!("Agent listed: mint={}, price={}", ctx.accounts.mint.key(), price_lamports);

        emit!(AgentListed {
            seller: ctx.accounts.seller.key(),
            mint: ctx.accounts.mint.key(),
            price: price_lamports,
        });

        Ok(())
    }

    // ─── Buy Agent from Marketplace ─────────────────────────────────────
    pub fn buy_agent(ctx: Context<BuyAgent>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        require!(listing.is_active, ErrorCode::ListingNotActive);

        let price = listing.price;
        let platform_fee = price * 25 / 1000; // 2.5% fee
        let seller_amount = price - platform_fee;

        // Pay seller
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.seller.to_account_info(),
                },
            ),
            seller_amount,
        )?;

        // Pay platform fee to treasury
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            platform_fee,
        )?;

        // Mark listing as inactive
        listing.is_active = false;

        emit!(AgentSold {
            buyer: ctx.accounts.buyer.key(),
            seller: listing.seller,
            mint: listing.mint,
            price,
        });

        Ok(())
    }

    // ─── Cancel Listing ─────────────────────────────────────────────────
    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        require!(listing.is_active, ErrorCode::ListingNotActive);
        require!(
            listing.seller == ctx.accounts.seller.key(),
            ErrorCode::Unauthorized
        );

        listing.is_active = false;

        emit!(ListingCancelled {
            seller: listing.seller,
            mint: listing.mint,
        });

        Ok(())
    }

    // ─── Create Match Stake ─────────────────────────────────────────────
    pub fn create_stake(
        ctx: Context<CreateStake>,
        match_id: String,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidPrice);

        let stake = &mut ctx.accounts.stake;
        stake.match_id = match_id;
        stake.player_a = ctx.accounts.player.key();
        stake.player_b = Pubkey::default();
        stake.amount = amount;
        stake.is_resolved = false;
        stake.created_at = Clock::get()?.unix_timestamp;

        // Transfer stake to PDA
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: ctx.accounts.stake.to_account_info(),
                },
            ),
            amount,
        )?;

        emit!(StakeCreated {
            match_id: stake.match_id.clone(),
            player: ctx.accounts.player.key(),
            amount,
        });

        Ok(())
    }

    // ─── Join Stake (player B) ──────────────────────────────────────────
    pub fn join_stake(ctx: Context<JoinStake>) -> Result<()> {
        let stake = &mut ctx.accounts.stake;
        require!(!stake.is_resolved, ErrorCode::AlreadyResolved);
        require!(
            stake.player_b == Pubkey::default(),
            ErrorCode::StakeFull
        );

        stake.player_b = ctx.accounts.player.key();

        // Transfer matching stake
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: ctx.accounts.stake.to_account_info(),
                },
            ),
            stake.amount,
        )?;

        emit!(StakeJoined {
            match_id: stake.match_id.clone(),
            player: ctx.accounts.player.key(),
            amount: stake.amount,
        });

        Ok(())
    }

    // ─── Resolve Stake (authority only — backend calls this) ────────────
    pub fn resolve_stake(
        ctx: Context<ResolveStake>,
        _match_id: String,
    ) -> Result<()> {
        let stake = &mut ctx.accounts.stake;
        require!(!stake.is_resolved, ErrorCode::AlreadyResolved);

        // Only the config authority can resolve stakes
        let config = &ctx.accounts.config;
        require!(
            ctx.accounts.authority.key() == config.authority,
            ErrorCode::Unauthorized
        );

        let total_pot = stake.amount * 2;
        let platform_cut = total_pot * 5 / 100; // 5% rake
        let winner_payout = total_pot - platform_cut;

        // Pay winner
        **ctx.accounts.stake.to_account_info().try_borrow_mut_lamports()? -= winner_payout;
        **ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()? += winner_payout;

        // Pay platform fee
        **ctx.accounts.stake.to_account_info().try_borrow_mut_lamports()? -= platform_cut;
        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += platform_cut;

        stake.is_resolved = true;

        emit!(StakeResolved {
            match_id: stake.match_id.clone(),
            winner: ctx.accounts.winner.key(),
            payout: winner_payout,
        });

        Ok(())
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Accounts
// ═══════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + GameConfig::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, GameConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Treasury wallet — just receives SOL
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PurchasePack<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, GameConfig>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: Treasury wallet
    #[account(mut, address = config.treasury)]
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: Prize pool PDA
    #[account(
        mut,
        seeds = [b"prize_pool"],
        bump
    )]
    pub prize_pool: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ListAgent<'info> {
    #[account(
        init,
        payer = seller,
        space = 8 + Listing::INIT_SPACE,
        seeds = [b"listing", mint.key().as_ref()],
        bump
    )]
    pub listing: Account<'info, Listing>,
    #[account(mut)]
    pub seller: Signer<'info>,
    /// CHECK: Mint of the NFT being listed
    pub mint: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyAgent<'info> {
    #[account(
        mut,
        constraint = listing.is_active @ ErrorCode::ListingNotActive
    )]
    pub listing: Account<'info, Listing>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: Seller receives SOL
    #[account(mut, address = listing.seller)]
    pub seller: UncheckedAccount<'info>,
    /// CHECK: Treasury receives fees
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelListing<'info> {
    #[account(
        mut,
        constraint = listing.seller == seller.key() @ ErrorCode::Unauthorized
    )]
    pub listing: Account<'info, Listing>,
    pub seller: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(match_id: String)]
pub struct CreateStake<'info> {
    #[account(
        init,
        payer = player,
        space = 8 + MatchStake::INIT_SPACE,
        seeds = [b"stake", match_id.as_bytes()],
        bump
    )]
    pub stake: Account<'info, MatchStake>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinStake<'info> {
    #[account(mut)]
    pub stake: Account<'info, MatchStake>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(match_id: String)]
pub struct ResolveStake<'info> {
    #[account(
        mut,
        seeds = [b"stake", match_id.as_bytes()],
        bump,
        constraint = !stake.is_resolved @ ErrorCode::AlreadyResolved
    )]
    pub stake: Account<'info, MatchStake>,
    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, GameConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Winner receives payout
    #[account(mut)]
    pub winner: UncheckedAccount<'info>,
    /// CHECK: Treasury receives rake
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

// ═══════════════════════════════════════════════════════════════════════
// State Accounts
// ═══════════════════════════════════════════════════════════════════════

#[account]
#[derive(InitSpace)]
pub struct GameConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub total_packs_sold: u64,
    pub total_matches: u64,
    pub prize_pool: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub seller: Pubkey,
    pub mint: Pubkey,
    pub price: u64,
    pub created_at: i64,
    pub is_active: bool,
}

#[account]
#[derive(InitSpace)]
pub struct MatchStake {
    #[max_len(64)]
    pub match_id: String,
    pub player_a: Pubkey,
    pub player_b: Pubkey,
    pub amount: u64,
    pub is_resolved: bool,
    pub created_at: i64,
}

// ═══════════════════════════════════════════════════════════════════════
// Events
// ═══════════════════════════════════════════════════════════════════════

#[event]
pub struct PackPurchased {
    pub buyer: Pubkey,
    pub pack_type: u8,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct AgentListed {
    pub seller: Pubkey,
    pub mint: Pubkey,
    pub price: u64,
}

#[event]
pub struct AgentSold {
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub mint: Pubkey,
    pub price: u64,
}

#[event]
pub struct ListingCancelled {
    pub seller: Pubkey,
    pub mint: Pubkey,
}

#[event]
pub struct StakeCreated {
    pub match_id: String,
    pub player: Pubkey,
    pub amount: u64,
}

#[event]
pub struct StakeJoined {
    pub match_id: String,
    pub player: Pubkey,
    pub amount: u64,
}

#[event]
pub struct StakeResolved {
    pub match_id: String,
    pub winner: Pubkey,
    pub payout: u64,
}

// ═══════════════════════════════════════════════════════════════════════
// Errors
// ═══════════════════════════════════════════════════════════════════════

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid pack type (0-3)")]
    InvalidPackType,
    #[msg("Listing is not active")]
    ListingNotActive,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Stake already resolved")]
    AlreadyResolved,
    #[msg("Stake is full — both players already joined")]
    StakeFull,
    #[msg("Price must be greater than 0")]
    InvalidPrice,
}
