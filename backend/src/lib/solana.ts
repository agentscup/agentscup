import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import dotenv from "dotenv";
dotenv.config();

const cluster = (process.env.SOLANA_CLUSTER || "mainnet-beta") as "devnet" | "mainnet-beta";
const rpcUrl = process.env.SOLANA_RPC_URL || clusterApiUrl(cluster);

export const connection = new Connection(rpcUrl, "confirmed");

export const TREASURY_WALLET = new PublicKey(
  process.env.TREASURY_WALLET || "11111111111111111111111111111111"
);

export const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "11111111111111111111111111111111"
);

/* ================================================================== */
/*  $CUP Token Configuration (Token-2022)                              */
/* ================================================================== */

export const TOKEN_MINT = new PublicKey(
  process.env.TOKEN_MINT || "FjZvB6k9jCWDBUsgXRxJUByrqWHADQJigXK233b5pump"
);
export const TOKEN_DECIMALS = 6;

/** Entry fee for a PvP match (in $CUP tokens, UI units) */
export const MATCH_ENTRY_FEE_CUP = 100_000;

/** Convert token amount (UI units) to raw on-chain units */
export function tokenToRaw(amount: number): bigint {
  return BigInt(amount) * BigInt(10 ** TOKEN_DECIMALS);
}

/**
 * Get SOL balance for a wallet (kept for wallet fee checks).
 */
export async function getBalance(walletAddress: string): Promise<number> {
  const pubkey = new PublicKey(walletAddress);
  const lamports = await connection.getBalance(pubkey);
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Verify a $CUP token payment transaction on-chain.
 * Checks that the user transferred >= expectedAmount tokens to treasury.
 */
export async function verifyTokenPaymentTransaction(
  txSignature: string,
  payerWallet: string,
  expectedAmount: number
): Promise<{ valid: boolean; error?: string }> {
  try {
    const tx = await connection.getTransaction(txSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) return { valid: false, error: "Transaction not found" };
    if (tx.meta?.err) return { valid: false, error: "Transaction failed on-chain" };

    const accountKeys = tx.transaction.message.getAccountKeys();
    const payerKey = accountKeys.get(0);
    if (!payerKey || payerKey.toBase58() !== payerWallet) {
      return { valid: false, error: "Payer mismatch" };
    }

    const preTokenBalances = tx.meta?.preTokenBalances || [];
    const postTokenBalances = tx.meta?.postTokenBalances || [];
    const treasuryAddress = TREASURY_WALLET.toBase58();
    const mintAddress = TOKEN_MINT.toBase58();
    const expectedRaw = tokenToRaw(expectedAmount);

    let treasuryReceived = BigInt(0);
    for (const post of postTokenBalances) {
      if (post.mint === mintAddress && post.owner === treasuryAddress) {
        const postAmount = BigInt(post.uiTokenAmount.amount);
        const pre = preTokenBalances.find(
          (p) => p.accountIndex === post.accountIndex && p.mint === mintAddress
        );
        const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : BigInt(0);
        treasuryReceived = postAmount - preAmount;
        break;
      }
    }

    if (treasuryReceived < expectedRaw) {
      return {
        valid: false,
        error: `Treasury received ${treasuryReceived} raw tokens, expected ${expectedRaw}`,
      };
    }

    console.log(
      `[CUP PAYMENT] Verified: payer=${payerWallet.slice(0, 8)} amount=${treasuryReceived} tx=${txSignature.slice(0, 12)}`
    );
    return { valid: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { valid: false, error: message };
  }
}

/**
 * Backward-compat alias: entry fee verification for matches.
 */
export async function verifyEntryFeeTransaction(
  txSignature: string,
  payerWallet: string
): Promise<{ valid: boolean; error?: string }> {
  return verifyTokenPaymentTransaction(txSignature, payerWallet, MATCH_ENTRY_FEE_CUP);
}

/**
 * Send $CUP tokens from treasury to a wallet.
 * Used for: match winner payout, queue-cancel refund.
 */
export async function sendTokenPayout(
  recipientWallet: string,
  tokenAmount: number
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const treasury = getTreasuryKeypair();
    const recipient = new PublicKey(recipientWallet);
    const rawAmount = tokenToRaw(tokenAmount);

    const treasuryAta = getAssociatedTokenAddressSync(TOKEN_MINT, treasury.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const recipientAta = getAssociatedTokenAddressSync(TOKEN_MINT, recipient, false, TOKEN_2022_PROGRAM_ID);

    const treasuryTokenAccount = await getAccount(connection, treasuryAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    if (treasuryTokenAccount.amount < rawAmount) {
      return { success: false, error: `Insufficient treasury token balance` };
    }

    const tx = new Transaction();

    // Create recipient ATA if needed
    try {
      await getAccount(connection, recipientAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    } catch {
      tx.add(
        createAssociatedTokenAccountInstruction(
          treasury.publicKey, recipientAta, recipient, TOKEN_MINT,
          TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    tx.add(
      createTransferInstruction(treasuryAta, recipientAta, treasury.publicKey, rawAmount, [], TOKEN_2022_PROGRAM_ID)
    );

    const signature = await sendAndConfirmTransaction(connection, tx, [treasury], {
      commitment: "confirmed",
    });

    console.log(`[CUP PAYOUT] Sent ${tokenAmount} $CUP to ${recipientWallet.slice(0, 8)} tx=${signature.slice(0, 12)}`);
    return { success: true, signature };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[CUP PAYOUT ERROR] ${recipientWallet.slice(0, 8)}: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Backward-compat alias: refund/payout for matches (now in $CUP).
 */
export async function sendPayout(
  recipientWallet: string,
  amountCup: number
): Promise<{ success: boolean; signature?: string; error?: string }> {
  return sendTokenPayout(recipientWallet, amountCup);
}

/** Get treasury keypair for signing outgoing transactions */
function getTreasuryKeypair(): Keypair {
  const raw = process.env.TREASURY_PRIVATE_KEY;
  if (!raw) throw new Error("TREASURY_PRIVATE_KEY not configured");
  const secretKey = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Lightweight marketplace/pack payment verification — checks tx exists,
 * succeeded, payer matches, and $CUP was transferred to treasury.
 * Exact amount validation can be done by caller via verifyTokenPaymentTransaction.
 */
export async function verifyMarketplaceTransaction(
  txSignature: string,
  expectedPayer: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const tx = await connection.getTransaction(txSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) return { valid: false, error: "Transaction not found" };
    if (tx.meta?.err) return { valid: false, error: "Transaction failed on-chain" };

    const accountKeys = tx.transaction.message.getAccountKeys();
    const payerKey = accountKeys.get(0);
    if (!payerKey || payerKey.toBase58() !== expectedPayer) {
      return { valid: false, error: "Payer mismatch" };
    }

    // Verify treasury received some $CUP
    const postTokenBalances = tx.meta?.postTokenBalances || [];
    const preTokenBalances = tx.meta?.preTokenBalances || [];
    const treasuryAddress = TREASURY_WALLET.toBase58();
    const mintAddress = TOKEN_MINT.toBase58();

    let treasuryReceived = BigInt(0);
    for (const post of postTokenBalances) {
      if (post.mint === mintAddress && post.owner === treasuryAddress) {
        const postAmount = BigInt(post.uiTokenAmount.amount);
        const pre = preTokenBalances.find(
          (p) => p.accountIndex === post.accountIndex && p.mint === mintAddress
        );
        const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : BigInt(0);
        treasuryReceived = postAmount - preAmount;
        break;
      }
    }

    if (treasuryReceived <= 0) {
      return { valid: false, error: "No $CUP was transferred to treasury" };
    }

    console.log(`[VERIFY MARKET TX] payer=${expectedPayer.slice(0, 8)} received=${treasuryReceived} raw $CUP`);
    return { valid: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { valid: false, error: message };
  }
}
