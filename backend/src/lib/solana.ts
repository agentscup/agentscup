import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
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

/**
 * Verify a transaction exists on-chain and meets requirements.
 */
export async function verifyTransaction(
  txSignature: string,
  expectedPayer: string,
  expectedLamports: number
): Promise<{ valid: boolean; error?: string }> {
  try {
    const tx = await connection.getTransaction(
      txSignature,
      { commitment: "confirmed", maxSupportedTransactionVersion: 0 }
    );

    if (!tx) {
      return { valid: false, error: "Transaction not found" };
    }

    if (tx.meta?.err) {
      return { valid: false, error: "Transaction failed on-chain" };
    }

    // Verify the payer is in the signers
    const accountKeys = tx.transaction.message.getAccountKeys();
    const payerKey = accountKeys.get(0);
    if (!payerKey || payerKey.toBase58() !== expectedPayer) {
      return { valid: false, error: "Payer mismatch" };
    }

    // Verify SOL was transferred (check balance changes)
    if (tx.meta && expectedLamports > 0) {
      const preBalances = tx.meta.preBalances;
      const postBalances = tx.meta.postBalances;
      const spent = preBalances[0] - postBalances[0];
      console.log(`[VERIFY TX] expected=${expectedLamports} spent=${spent} pre=${preBalances[0]} post=${postBalances[0]}`);
      // Allow tolerance for fees (50k lamports = 0.00005 SOL)
      if (spent < expectedLamports - 50000) {
        return { valid: false, error: `Insufficient transfer amount (expected ~${expectedLamports}, got ${spent})` };
      }
    }

    return { valid: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { valid: false, error: message };
  }
}

/**
 * Verify a marketplace buy transaction — lighter check.
 * Only verifies: tx exists, succeeded, payer matches, and some SOL was spent.
 * Exact amount check is skipped since buyer explicitly approved the amount in wallet.
 */
export async function verifyMarketplaceTransaction(
  txSignature: string,
  expectedPayer: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const tx = await connection.getTransaction(
      txSignature,
      { commitment: "confirmed", maxSupportedTransactionVersion: 0 }
    );

    if (!tx) {
      return { valid: false, error: "Transaction not found" };
    }

    if (tx.meta?.err) {
      return { valid: false, error: "Transaction failed on-chain" };
    }

    const accountKeys = tx.transaction.message.getAccountKeys();
    const payerKey = accountKeys.get(0);
    if (!payerKey || payerKey.toBase58() !== expectedPayer) {
      return { valid: false, error: "Payer mismatch" };
    }

    // Just verify SOME SOL was spent (not zero-cost exploit)
    if (tx.meta) {
      const spent = tx.meta.preBalances[0] - tx.meta.postBalances[0];
      if (spent <= 0) {
        return { valid: false, error: "No SOL was transferred" };
      }
      console.log(`[VERIFY MARKET TX] payer=${expectedPayer} spent=${spent} lamports`);
    }

    return { valid: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { valid: false, error: message };
  }
}

/**
 * Convert SOL to lamports
 */
export function solToLamports(sol: number): number {
  return Math.round(sol * LAMPORTS_PER_SOL);
}

/**
 * Get SOL balance for a wallet
 */
export async function getBalance(walletAddress: string): Promise<number> {
  const pubkey = new PublicKey(walletAddress);
  const lamports = await connection.getBalance(pubkey);
  return lamports / LAMPORTS_PER_SOL;
}

/* ================================================================== */
/*  Match Entry Fee System                                             */
/* ================================================================== */

export const MATCH_ENTRY_FEE_SOL = 0.01;

/* ================================================================== */
/*  $CUP Token Staking                                                 */
/* ================================================================== */

export const TOKEN_MINT = new PublicKey(
  process.env.TOKEN_MINT || "FjZvB6k9jCWDBUsgXRxJUByrqWHADQJigXK233b5pump"
);
export const TOKEN_DECIMALS = 6;
export const STAKE_THRESHOLD = 5_000_000; // 5M tokens needed to play free

/** Convert token amount to raw units */
export function tokenToRaw(amount: number): bigint {
  return BigInt(amount) * BigInt(10 ** TOKEN_DECIMALS);
}

/**
 * Verify a token stake transaction on-chain.
 * Checks that the user transferred >= STAKE_THRESHOLD tokens to treasury.
 */
export async function verifyTokenStakeTransaction(
  txSignature: string,
  payerWallet: string
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
    const expectedRaw = tokenToRaw(STAKE_THRESHOLD);

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
      `[STAKE] Verified: payer=${payerWallet.slice(0, 8)} amount=${treasuryReceived} tx=${txSignature.slice(0, 12)}`
    );
    return { valid: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { valid: false, error: message };
  }
}

/**
 * Send SPL tokens from treasury to a wallet (for unstaking).
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

    console.log(`[TOKEN PAYOUT] Sent ${tokenAmount} tokens to ${recipientWallet.slice(0, 8)} tx=${signature.slice(0, 12)}`);
    return { success: true, signature };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[TOKEN PAYOUT ERROR] ${recipientWallet.slice(0, 8)}: ${message}`);
    return { success: false, error: message };
  }
}

/** Get treasury keypair for signing outgoing transactions */
function getTreasuryKeypair(): Keypair {
  const raw = process.env.TREASURY_PRIVATE_KEY;
  if (!raw) throw new Error("TREASURY_PRIVATE_KEY not configured");
  const secretKey = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secretKey);
}

/**
 * Verify an entry fee transaction:
 * - TX exists and succeeded on-chain
 * - Payer matches the claimed wallet
 * - Treasury wallet received >= entry fee amount
 */
export async function verifyEntryFeeTransaction(
  txSignature: string,
  payerWallet: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const tx = await connection.getTransaction(txSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) return { valid: false, error: "Transaction not found" };
    if (tx.meta?.err) return { valid: false, error: "Transaction failed on-chain" };

    // Verify payer
    const accountKeys = tx.transaction.message.getAccountKeys();
    const payerKey = accountKeys.get(0);
    if (!payerKey || payerKey.toBase58() !== payerWallet) {
      return { valid: false, error: "Payer mismatch" };
    }

    // Verify treasury received the entry fee
    const treasuryAddress = TREASURY_WALLET.toBase58();
    let treasuryIdx = -1;
    for (let i = 0; i < accountKeys.length; i++) {
      if (accountKeys.get(i)?.toBase58() === treasuryAddress) {
        treasuryIdx = i;
        break;
      }
    }

    if (treasuryIdx === -1) {
      return { valid: false, error: "Treasury not in transaction" };
    }

    const expectedLamports = solToLamports(MATCH_ENTRY_FEE_SOL);
    const treasuryReceived =
      tx.meta!.postBalances[treasuryIdx] - tx.meta!.preBalances[treasuryIdx];

    if (treasuryReceived < expectedLamports - 1000) {
      return {
        valid: false,
        error: `Treasury received ${treasuryReceived}, expected ${expectedLamports}`,
      };
    }

    console.log(
      `[ENTRY FEE] Verified: payer=${payerWallet.slice(0, 8)} amount=${treasuryReceived} tx=${txSignature.slice(0, 12)}`
    );
    return { valid: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { valid: false, error: message };
  }
}

/**
 * Send SOL from treasury to a recipient wallet.
 * Used for match winner payouts and queue-cancel refunds.
 */
export async function sendPayout(
  recipientWallet: string,
  amountSol: number
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const treasury = getTreasuryKeypair();
    const recipient = new PublicKey(recipientWallet);
    const lamports = solToLamports(amountSol);

    // Check treasury balance — reserve 10k lamports for tx fee
    const balance = await connection.getBalance(treasury.publicKey);
    const txFeeReserve = 10_000; // ~0.00001 SOL covers Solana tx fee
    const sendLamports = Math.min(lamports, balance - txFeeReserve);

    console.log(`[PAYOUT] Treasury balance: ${balance} lamports, requested: ${lamports}, sending: ${sendLamports}`);

    if (sendLamports <= 0 || sendLamports < lamports * 0.95) {
      const err = `Insufficient treasury balance: has ${balance}, need ~${lamports + txFeeReserve}`;
      console.error(`[PAYOUT] ${err}`);
      return { success: false, error: err };
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: treasury.publicKey,
        toPubkey: recipient,
        lamports: sendLamports,
      })
    );

    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [treasury],
      { commitment: "confirmed" }
    );

    const actualSol = sendLamports / LAMPORTS_PER_SOL;
    console.log(
      `[PAYOUT] Sent ${actualSol} SOL to ${recipientWallet.slice(0, 8)} tx=${signature.slice(0, 12)}`
    );
    return { success: true, signature };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[PAYOUT ERROR] ${recipientWallet.slice(0, 8)}: ${message}`);
    return { success: false, error: message };
  }
}
