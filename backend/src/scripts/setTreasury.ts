/**
 * Point PackStore + Marketplace at a new treasury wallet. The admin
 * (deployer) calls `setTreasury(newAddress)` on each contract.
 * MatchEscrow has no treasury concept — settlement flows directly
 * to the winner — so it doesn't need a change.
 *
 * Keeps the existing OPERATOR signer (0x5A31…6568) in place, which
 * the backend still uses to sign match-escrow payouts. Separates
 * revenue recipient (this new wallet) from the hot operator wallet,
 * which is the cleaner security posture for production.
 *
 *   cd backend && npx ts-node src/scripts/setTreasury.ts
 */
import dotenv from "dotenv";
dotenv.config();

import { createWalletClient, createPublicClient, http, getAddress, type Hex } from "viem";
import { privateKeyToAccount, nonceManager } from "viem/accounts";
import { base } from "viem/chains";

import PackStoreAbi from "../abi/AgentsCupPackStore.json";
import MarketplaceAbi from "../abi/AgentsCupMarketplace.json";

const NEW_TREASURY = "0x1d4333f725ee240aea939cbAD3216332FB8495EB";
const PACK_STORE = "0xD35F2536043786e27453A2A58e084905bd6D0ce2";
const MARKETPLACE = "0x9983D5c374A656De96804a4195983Fd3021Ea705";

async function main() {
  const pk = (process.env.TREASURY_PRIVATE_KEY ?? "").trim();
  if (!pk) throw new Error("TREASURY_PRIVATE_KEY missing in backend/.env");

  const account = privateKeyToAccount(
    (pk.startsWith("0x") ? pk : `0x${pk}`) as Hex,
    { nonceManager }
  );
  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
  });
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
  });

  console.log("Admin (signer):", account.address);
  console.log("New treasury  :", NEW_TREASURY);
  console.log();

  // ── Read current treasury so we can confirm the change ───────────
  const beforePack = (await publicClient.readContract({
    address: PACK_STORE as `0x${string}`,
    abi: PackStoreAbi,
    functionName: "treasury",
  })) as string;
  const beforeMkt = (await publicClient.readContract({
    address: MARKETPLACE as `0x${string}`,
    abi: MarketplaceAbi,
    functionName: "treasury",
  })) as string;
  console.log(`PackStore treasury (before):   ${beforePack}`);
  console.log(`Marketplace treasury (before): ${beforeMkt}`);
  console.log();

  // ── PackStore ────────────────────────────────────────────────────
  console.log("→ calling PackStore.setTreasury...");
  const hash1 = await walletClient.writeContract({
    account,
    chain: base,
    address: PACK_STORE as `0x${string}`,
    abi: PackStoreAbi,
    functionName: "setTreasury",
    args: [getAddress(NEW_TREASURY)],
  });
  console.log(`  tx: ${hash1}`);
  await publicClient.waitForTransactionReceipt({ hash: hash1, timeout: 60_000 });
  console.log("  ✓ mined");

  // ── Marketplace ──────────────────────────────────────────────────
  console.log("→ calling Marketplace.setTreasury...");
  const hash2 = await walletClient.writeContract({
    account,
    chain: base,
    address: MARKETPLACE as `0x${string}`,
    abi: MarketplaceAbi,
    functionName: "setTreasury",
    args: [getAddress(NEW_TREASURY)],
  });
  console.log(`  tx: ${hash2}`);
  await publicClient.waitForTransactionReceipt({ hash: hash2, timeout: 60_000 });
  console.log("  ✓ mined");

  // ── Verify on-chain state ────────────────────────────────────────
  console.log();
  const afterPack = (await publicClient.readContract({
    address: PACK_STORE as `0x${string}`,
    abi: PackStoreAbi,
    functionName: "treasury",
  })) as string;
  const afterMkt = (await publicClient.readContract({
    address: MARKETPLACE as `0x${string}`,
    abi: MarketplaceAbi,
    functionName: "treasury",
  })) as string;
  console.log(`PackStore treasury (after):   ${afterPack}`);
  console.log(`Marketplace treasury (after): ${afterMkt}`);

  if (
    afterPack.toLowerCase() !== NEW_TREASURY.toLowerCase() ||
    afterMkt.toLowerCase() !== NEW_TREASURY.toLowerCase()
  ) {
    throw new Error("Treasury change not reflected on-chain after receipts!");
  }
  console.log("\n✅ Treasury updated on both contracts.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
