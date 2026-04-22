import { ethers, network, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Finish a partial deploy that died before AgentsCupMatchEscrow
 * could land on-chain. Reads the existing `deployments/<net>.json`
 * for the already-deployed PackStore + Marketplace addresses, only
 * deploys the escrow, then merges the updated record.
 *
 * Run after the main deploy script failed with nonce/connection
 * issues mid-flight:
 *
 *   npx hardhat run scripts/deployEscrowOnly.ts --network base
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const admin = (process.env.ADMIN_ADDRESS || deployerAddress) as string;

  console.log("\n=== Deploying AgentsCupMatchEscrow (finish) ===");
  console.log(`Network : ${network.name} (chainId=${network.config.chainId})`);
  console.log(`Deployer: ${deployerAddress}`);
  console.log(`Admin   : ${admin}`);

  const Escrow = await ethers.getContractFactory("AgentsCupMatchEscrow");
  const escrow = await Escrow.deploy(admin);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`  AgentsCupMatchEscrow @ ${escrowAddress}`);
  console.log(`    default entry fee: 0.001 ETH (adjustable via setEntryFee)`);

  // Merge into existing deployments file if present.
  const outDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${network.name}.json`);

  let record: Record<string, unknown> = {};
  if (fs.existsSync(outFile)) {
    try {
      record = JSON.parse(fs.readFileSync(outFile, "utf8"));
    } catch {
      /* start fresh */
    }
  }
  const contracts = ((record.contracts as Record<string, string>) ?? {});
  contracts.AgentsCupMatchEscrow = escrowAddress;
  record.contracts = contracts;
  record.deployedAt = new Date().toISOString();
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2));
  console.log(`\nUpdated ${outFile}`);

  if (process.env.BASESCAN_API_KEY && network.name !== "localhost" && network.name !== "hardhat") {
    console.log("\nVerifying escrow on Basescan...");
    try {
      await run("verify:verify", {
        address: escrowAddress,
        constructorArguments: [admin],
      });
      console.log("Verification complete.");
    } catch (e: unknown) {
      console.warn("Verification failed (retry with `npm run verify:base`):", (e as Error).message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
