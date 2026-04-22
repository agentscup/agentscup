import { ethers, network, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy CupMerkleDistributor with the root from merkle_root.txt.
 *
 * Environment overrides:
 *   CUP_TOKEN_ADDRESS    — defaults to Base mainnet CUP deployed earlier
 *   MERKLE_ROOT          — override the root file
 *   CLAIM_DEADLINE_DAYS  — days until sweep is callable (default 90; 0 = no deadline)
 *   ADMIN_ADDRESS        — owner of the distributor (default: deployer)
 *
 *   npm run deploy:merkle:base
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);

  const cupAddress =
    process.env.CUP_TOKEN_ADDRESS ||
    "0x08d1c6b78e8aa80E0C505829C30C0f81F984a668"; // deployed Base mainnet
  const airdropRoot =
    process.env.AIRDROP_ROOT || "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop";
  const rootFromFile = fs
    .readFileSync(path.join(airdropRoot, "merkle", "merkle_root.txt"), "utf8")
    .trim();
  const merkleRoot = (process.env.MERKLE_ROOT || rootFromFile) as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(merkleRoot)) {
    throw new Error(`Invalid merkle root: ${merkleRoot}`);
  }
  const deadlineDays = Number(process.env.CLAIM_DEADLINE_DAYS ?? 90);
  const claimDeadline =
    deadlineDays === 0 ? 0 : Math.floor(Date.now() / 1000) + deadlineDays * 86400;
  const owner = (process.env.ADMIN_ADDRESS || deployerAddress) as string;

  console.log(`\n═══ CupMerkleDistributor deployment ═══`);
  console.log(`Network:       ${network.name} (${network.config.chainId})`);
  console.log(`Deployer:      ${deployerAddress}`);
  console.log(`Balance:       ${ethers.formatEther(balance)} ETH`);
  console.log(`CUP token:     ${cupAddress}`);
  console.log(`Merkle root:   ${merkleRoot}`);
  console.log(`Deadline:      ${claimDeadline === 0 ? "none" : new Date(claimDeadline * 1000).toISOString()}`);
  console.log(`Owner:         ${owner}\n`);

  if (balance === 0n && network.name !== "localhost" && network.name !== "hardhat") {
    throw new Error("Deployer has 0 ETH");
  }

  console.log("Deploying CupMerkleDistributor...");
  const D = await ethers.getContractFactory("CupMerkleDistributor");
  const d = await D.deploy(cupAddress, merkleRoot, claimDeadline, owner);
  await d.waitForDeployment();
  const addr = await d.getAddress();
  const tx = d.deploymentTransaction();
  console.log(`  @ ${addr}`);
  console.log(`  tx: ${tx?.hash}`);

  // Save to deployments
  const outDir = path.join(__dirname, "..", "deployments");
  const outFile = path.join(outDir, `${network.name}.json`);
  let deployment: Record<string, any> = {};
  if (fs.existsSync(outFile)) deployment = JSON.parse(fs.readFileSync(outFile, "utf8"));
  deployment.contracts = deployment.contracts || {};
  deployment.contracts.CupMerkleDistributor = addr;
  deployment.merkleRoot = merkleRoot;
  deployment.claimDeadline = claimDeadline;
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));

  // Sourcify verify (no Etherscan key)
  try {
    await run("verify:verify", {
      address: addr,
      constructorArguments: [cupAddress, merkleRoot, claimDeadline, owner],
    });
  } catch (e) {
    console.warn("[verify] partial:", (e as Error).message.slice(0, 200));
  }

  console.log(`\n═══ NEXT STEPS ═══`);
  console.log(`1. Transfer 220M CUP to distributor:`);
  console.log(`   npm run fund:merkle:base`);
  console.log(`2. Build claim UI pointing at ${addr}`);
  console.log(`3. Announce: users claim at https://agentscup.com/claim`);
}

main().catch((e) => { console.error(e); process.exit(1); });
