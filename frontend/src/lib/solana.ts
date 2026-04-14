import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
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

/** Create a SOL transfer transaction for pack purchase */
export async function createPackPurchaseTx(
  buyerPubkey: PublicKey,
  priceSol: number
): Promise<Transaction> {
  const lamports = Math.round(priceSol * LAMPORTS_PER_SOL);

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: buyerPubkey,
      toPubkey: TREASURY_WALLET,
      lamports,
    })
  );

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = buyerPubkey;

  return tx;
}

/** Create a SOL transfer for marketplace purchase */
export async function createBuyAgentTx(
  buyerPubkey: PublicKey,
  sellerPubkey: PublicKey,
  priceSol: number
): Promise<Transaction> {
  const lamports = Math.round(priceSol * LAMPORTS_PER_SOL);
  const platformFee = Math.round(lamports * 0.025); // 2.5%
  const sellerAmount = lamports - platformFee;

  const tx = new Transaction()
    .add(
      SystemProgram.transfer({
        fromPubkey: buyerPubkey,
        toPubkey: sellerPubkey,
        lamports: sellerAmount,
      })
    )
    .add(
      SystemProgram.transfer({
        fromPubkey: buyerPubkey,
        toPubkey: TREASURY_WALLET,
        lamports: platformFee,
      })
    );

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = buyerPubkey;

  return tx;
}

/** Send SOL payment to treasury and return tx signature */
export async function sendSolPayment(
  conn: Connection,
  payerPubkey: PublicKey,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  priceSol: number
): Promise<string> {
  const tx = await createPackPurchaseTx(payerPubkey, priceSol);
  const signed = await signTransaction(tx);
  const signature = await conn.sendRawTransaction(signed.serialize());
  await conn.confirmTransaction(signature, "confirmed");
  return signature;
}

/** Get SOL balance */
export async function getSolBalance(walletAddress: string): Promise<number> {
  const pubkey = new PublicKey(walletAddress);
  const lamports = await connection.getBalance(pubkey);
  return lamports / LAMPORTS_PER_SOL;
}

/* ================================================================== */
/*  $CUP Token Staking                                                 */
/* ================================================================== */

export const TOKEN_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_TOKEN_MINT || "FjZvB6k9jCWDBUsgXRxJUByrqWHADQJigXK233b5pump"
);
export const TOKEN_DECIMALS = 6;
export const STAKE_AMOUNT = 5_000_000;

function tokenToRaw(amount: number): bigint {
  return BigInt(amount) * BigInt(10 ** TOKEN_DECIMALS);
}

/** Send $CUP tokens (Token-2022) to treasury for staking */
export async function sendStakeTransaction(
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
