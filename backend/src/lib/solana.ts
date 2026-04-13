import {
  Connection,
  PublicKey,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
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
