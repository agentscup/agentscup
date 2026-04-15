import {
  Connection,
  PublicKey,
  Transaction,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "mainnet-beta") as "devnet" | "mainnet-beta";
const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(cluster);

export const connection = new Connection(rpcUrl, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 60000,
});

export const TREASURY_WALLET = new PublicKey(
  process.env.NEXT_PUBLIC_TREASURY_WALLET || "11111111111111111111111111111111"
);

/* ================================================================== */
/*  $CUP Token Configuration (Token-2022)                              */
/* ================================================================== */

export const TOKEN_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_TOKEN_MINT || "FjZvB6k9jCWDBUsgXRxJUByrqWHADQJigXK233b5pump"
);
export const TOKEN_DECIMALS = 6;

/** Entry fee for a PvP match (in $CUP tokens, UI units) */
export const MATCH_ENTRY_FEE_CUP = 100_000;

function tokenToRaw(amount: number): bigint {
  return BigInt(amount) * BigInt(10 ** TOKEN_DECIMALS);
}

/** Get SOL balance (used for wallet fee pre-checks) */
export async function getSolBalance(walletAddress: string): Promise<number> {
  const pubkey = new PublicKey(walletAddress);
  const lamports = await connection.getBalance(pubkey);
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Send $CUP tokens (Token-2022) to treasury.
 * Used for: pack purchases, match entry fees.
 */
export async function sendCupPayment(
  conn: Connection,
  payerPubkey: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  tokenAmount: number
): Promise<string> {
  const rawAmount = tokenToRaw(tokenAmount);

  const payerAta = getAssociatedTokenAddressSync(TOKEN_MINT, payerPubkey, false, TOKEN_2022_PROGRAM_ID);
  const treasuryAta = getAssociatedTokenAddressSync(TOKEN_MINT, TREASURY_WALLET, false, TOKEN_2022_PROGRAM_ID);

  const tx = new Transaction();

  // Create treasury ATA if needed (Token-2022)
  try {
    await getAccount(conn, treasuryAta, "confirmed", TOKEN_2022_PROGRAM_ID);
  } catch {
    tx.add(
      createAssociatedTokenAccountInstruction(
        payerPubkey, treasuryAta, TREASURY_WALLET, TOKEN_MINT,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  tx.add(
    createTransferInstruction(payerAta, treasuryAta, payerPubkey, rawAmount, [], TOKEN_2022_PROGRAM_ID)
  );

  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payerPubkey;

  const signed = await signTransaction(tx);
  const signature = await conn.sendRawTransaction(signed.serialize());
  await conn.confirmTransaction(signature, "confirmed");
  return signature;
}

/**
 * Send $CUP tokens from buyer directly to seller (marketplace purchase).
 * Applies 2.5% platform fee to treasury.
 */
export async function sendCupMarketplacePayment(
  conn: Connection,
  buyerPubkey: PublicKey,
  sellerPubkey: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  priceCup: number
): Promise<string> {
  const platformFeeCup = Math.floor(priceCup * 0.025);
  const sellerCup = priceCup - platformFeeCup;

  const rawSeller = tokenToRaw(sellerCup);
  const rawFee = tokenToRaw(platformFeeCup);

  const buyerAta = getAssociatedTokenAddressSync(TOKEN_MINT, buyerPubkey, false, TOKEN_2022_PROGRAM_ID);
  const sellerAta = getAssociatedTokenAddressSync(TOKEN_MINT, sellerPubkey, false, TOKEN_2022_PROGRAM_ID);
  const treasuryAta = getAssociatedTokenAddressSync(TOKEN_MINT, TREASURY_WALLET, false, TOKEN_2022_PROGRAM_ID);

  const tx = new Transaction();

  // Ensure seller ATA exists
  try {
    await getAccount(conn, sellerAta, "confirmed", TOKEN_2022_PROGRAM_ID);
  } catch {
    tx.add(
      createAssociatedTokenAccountInstruction(
        buyerPubkey, sellerAta, sellerPubkey, TOKEN_MINT,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  // Ensure treasury ATA exists
  try {
    await getAccount(conn, treasuryAta, "confirmed", TOKEN_2022_PROGRAM_ID);
  } catch {
    tx.add(
      createAssociatedTokenAccountInstruction(
        buyerPubkey, treasuryAta, TREASURY_WALLET, TOKEN_MINT,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  if (rawSeller > BigInt(0)) {
    tx.add(
      createTransferInstruction(buyerAta, sellerAta, buyerPubkey, rawSeller, [], TOKEN_2022_PROGRAM_ID)
    );
  }

  if (rawFee > BigInt(0)) {
    tx.add(
      createTransferInstruction(buyerAta, treasuryAta, buyerPubkey, rawFee, [], TOKEN_2022_PROGRAM_ID)
    );
  }

  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = buyerPubkey;

  const signed = await signTransaction(tx);
  const signature = await conn.sendRawTransaction(signed.serialize());
  await conn.confirmTransaction(signature, "confirmed");
  return signature;
}

/** Get $CUP token balance (Token-2022) for a wallet */
export async function getTokenBalance(walletAddress: string): Promise<number> {
  try {
    const pubkey = new PublicKey(walletAddress);
    const ata = getAssociatedTokenAddressSync(TOKEN_MINT, pubkey, false, TOKEN_2022_PROGRAM_ID);
    const account = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
    return Number(account.amount) / (10 ** TOKEN_DECIMALS);
  } catch {
    return 0;
  }
}
