/**
 * Deploys the three V2 CUP-native contracts on Base and records the
 * addresses in deployments/base.json alongside the old ETH ones.
 *
 *   cd contracts-base
 *   npx hardhat run scripts/deployV2.ts --network base
 *
 * Economy (confirmed with ops):
 *   - Match entry fee:   50,000 CUP
 *   - Pack prices:
 *       Starter   50,000 CUP
 *       Pro      100,000 CUP
 *       Elite    250,000 CUP
 *       Legendary 750,000 CUP
 *   - Marketplace fee: 2.5% (250 bps) — same as the ETH version.
 */
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const CUP_WEI = 10n ** 18n;

async function main() {
  const [deployer] = await ethers.getSigners();
  const from = await deployer.getAddress();
  const bal = await ethers.provider.getBalance(from);

  console.log(`\n═══ V2 (CUP-native) deployment on ${network.name} ═══`);
  console.log(`Deployer:  ${from}`);
  console.log(`Balance:   ${ethers.formatEther(bal)} ETH (used for gas only)`);

  const deplFile = path.join(__dirname, "..", "deployments", "base.json");
  const depl = JSON.parse(fs.readFileSync(deplFile, "utf8"));
  const CUP = depl.contracts.AgentsCupToken as string;
  const TREASURY = depl.config.treasury as string;
  const ADMIN = depl.config.admin as string;

  if (!CUP || !TREASURY || !ADMIN) throw new Error("Missing cup/treasury/admin in base.json");

  console.log(`CUP token: ${CUP}`);
  console.log(`Treasury:  ${TREASURY}`);
  console.log(`Admin:     ${ADMIN}\n`);

  // ── Pack Store V2 ────────────────────────────────────────────────────
  const tiers = [1, 2, 3, 4]; // starter / pro / elite / legendary
  const prices = [
    50_000n * CUP_WEI,
    100_000n * CUP_WEI,
    250_000n * CUP_WEI,
    750_000n * CUP_WEI,
  ];
  console.log("[1/3] Deploying AgentsCupPackStoreV2...");
  const PackStoreV2 = await ethers.getContractFactory("AgentsCupPackStoreV2");
  const packStore = await PackStoreV2.deploy(CUP, TREASURY, ADMIN, tiers, prices);
  await packStore.waitForDeployment();
  const packStoreAddr = await packStore.getAddress();
  console.log(`    @ ${packStoreAddr}`);

  // ── Marketplace V2 ───────────────────────────────────────────────────
  console.log("[2/3] Deploying AgentsCupMarketplaceV2...");
  const MarketplaceV2 = await ethers.getContractFactory("AgentsCupMarketplaceV2");
  const marketplace = await MarketplaceV2.deploy(CUP, TREASURY, 250, ADMIN); // 2.5% fee
  await marketplace.waitForDeployment();
  const marketplaceAddr = await marketplace.getAddress();
  console.log(`    @ ${marketplaceAddr}`);

  // ── Match Escrow V2 ──────────────────────────────────────────────────
  const entryFee = 50_000n * CUP_WEI;
  console.log("[3/3] Deploying AgentsCupMatchEscrowV2...");
  const EscrowV2 = await ethers.getContractFactory("AgentsCupMatchEscrowV2");
  const escrow = await EscrowV2.deploy(CUP, ADMIN, entryFee);
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();
  console.log(`    @ ${escrowAddr}`);

  // ── Save ─────────────────────────────────────────────────────────────
  depl.contracts.AgentsCupPackStoreV2 = packStoreAddr;
  depl.contracts.AgentsCupMarketplaceV2 = marketplaceAddr;
  depl.contracts.AgentsCupMatchEscrowV2 = escrowAddr;
  depl.v2 = {
    packPrices: {
      starter: "50000",
      pro: "100000",
      elite: "250000",
      legendary: "750000",
    },
    matchEntryFee: "50000",
    marketplaceFeeBps: 250,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(deplFile, JSON.stringify(depl, null, 2));
  console.log(`\n✓ base.json updated`);

  console.log(`\n═══ NEXT STEPS ═══`);
  console.log(`1. Update frontend env:`);
  console.log(`     NEXT_PUBLIC_PACK_STORE_ADDRESS=${packStoreAddr}`);
  console.log(`     NEXT_PUBLIC_MARKETPLACE_ADDRESS=${marketplaceAddr}`);
  console.log(`     NEXT_PUBLIC_MATCH_ESCROW_ADDRESS=${escrowAddr}`);
  console.log(`2. Update backend env (Railway):`);
  console.log(`     PACK_STORE_ADDRESS=${packStoreAddr}`);
  console.log(`     MARKETPLACE_ADDRESS=${marketplaceAddr}`);
  console.log(`     MATCH_ESCROW_ADDRESS=${escrowAddr}`);
  console.log(`3. Wipe current marketplace listings in Supabase`);
  console.log(`4. Verify on BaseScan:`);
  console.log(`     npx hardhat verify --network base ${packStoreAddr} ${CUP} ${TREASURY} ${ADMIN} "[1,2,3,4]" "[${prices.join(",")}]"`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
