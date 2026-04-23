/**
 * Picks up where deployV2.ts stopped — deploys Marketplace + Escrow
 * after PackStoreV2 already landed. Adds a small delay between
 * deployments because base-mainnet's public RPC occasionally treats
 * back-to-back tx submissions as replacement txs and returns
 * "replacement transaction underpriced" during the pending-mempool
 * window.
 */
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const CUP_WEI = 10n ** 18n;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const from = await deployer.getAddress();

  console.log(`Continuing V2 deploy on ${network.name}`);
  console.log(`Deployer: ${from}\n`);

  const deplFile = path.join(__dirname, "..", "deployments", "base.json");
  const depl = JSON.parse(fs.readFileSync(deplFile, "utf8"));
  const CUP = depl.contracts.AgentsCupToken as string;
  const TREASURY = depl.config.treasury as string;
  const ADMIN = depl.config.admin as string;

  // ── Marketplace V2 ───────────────────────────────────────────────────
  if (!depl.contracts.AgentsCupMarketplaceV2) {
    console.log("[Marketplace] Waiting 10s for mempool to clear...");
    await sleep(10_000);
    const MarketplaceV2 = await ethers.getContractFactory("AgentsCupMarketplaceV2");
    const marketplace = await MarketplaceV2.deploy(CUP, TREASURY, 250, ADMIN);
    await marketplace.waitForDeployment();
    const addr = await marketplace.getAddress();
    console.log(`[Marketplace] @ ${addr}`);
    depl.contracts.AgentsCupMarketplaceV2 = addr;
    fs.writeFileSync(deplFile, JSON.stringify(depl, null, 2));
  } else {
    console.log(`[Marketplace] Already deployed at ${depl.contracts.AgentsCupMarketplaceV2}`);
  }

  // ── Match Escrow V2 ──────────────────────────────────────────────────
  if (!depl.contracts.AgentsCupMatchEscrowV2) {
    console.log("[Escrow] Waiting 10s for mempool to clear...");
    await sleep(10_000);
    const entryFee = 50_000n * CUP_WEI;
    const EscrowV2 = await ethers.getContractFactory("AgentsCupMatchEscrowV2");
    const escrow = await EscrowV2.deploy(CUP, ADMIN, entryFee);
    await escrow.waitForDeployment();
    const addr = await escrow.getAddress();
    console.log(`[Escrow] @ ${addr}`);
    depl.contracts.AgentsCupMatchEscrowV2 = addr;
    depl.v2 = depl.v2 || {
      packPrices: { starter: "50000", pro: "100000", elite: "250000", legendary: "750000" },
      matchEntryFee: "50000",
      marketplaceFeeBps: 250,
    };
    depl.v2.deployedAt = new Date().toISOString();
    fs.writeFileSync(deplFile, JSON.stringify(depl, null, 2));
  } else {
    console.log(`[Escrow] Already deployed at ${depl.contracts.AgentsCupMatchEscrowV2}`);
  }

  console.log("\n═══ Final V2 addresses ═══");
  console.log(`PackStoreV2:    ${depl.contracts.AgentsCupPackStoreV2}`);
  console.log(`MarketplaceV2:  ${depl.contracts.AgentsCupMarketplaceV2}`);
  console.log(`MatchEscrowV2:  ${depl.contracts.AgentsCupMatchEscrowV2}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
