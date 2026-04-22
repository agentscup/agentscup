import { ethers, network, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy AgentsCupToken (CUP) — fixed-supply ERC-20, 1B total, minted
 * to TREASURY_ADDRESS (falls back to deployer).
 *
 *   npm run deploy:cup:base       # Base mainnet
 *   npm run deploy:cup:sepolia    # Base Sepolia testnet
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);
  const treasury = (process.env.TREASURY_ADDRESS || deployerAddress) as string;

  console.log("\n=== Agents Cup Token (CUP) deployment ===");
  console.log(`Network : ${network.name} (chainId=${network.config.chainId})`);
  console.log(`Deployer: ${deployerAddress}`);
  console.log(`Balance : ${ethers.formatEther(balance)} ETH`);
  console.log(`Treasury: ${treasury}`);
  console.log(`Supply  : 1,000,000,000 CUP (18 decimals)\n`);

  if (
    balance === 0n &&
    network.name !== "localhost" &&
    network.name !== "hardhat"
  ) {
    throw new Error("Deployer has 0 ETH — fund it before deploying.");
  }

  console.log("Deploying AgentsCupToken...");
  const Token = await ethers.getContractFactory("AgentsCupToken");
  const token = await Token.deploy(treasury);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  const tx = token.deploymentTransaction();
  console.log(`  AgentsCupToken @ ${tokenAddress}`);
  console.log(`  tx hash       : ${tx?.hash}`);

  // Append to deployments/<network>.json without clobbering existing keys
  const outDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${network.name}.json`);
  let deployment: Record<string, unknown> = {};
  if (fs.existsSync(outFile)) {
    deployment = JSON.parse(fs.readFileSync(outFile, "utf8"));
  }
  const contracts = ((deployment.contracts as Record<string, string>) ?? {});
  contracts.AgentsCupToken = tokenAddress;
  deployment.contracts = contracts;
  deployment.tokenDeployedAt = new Date().toISOString();
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log(`\nToken address written to ${outFile}`);

  // Auto-verify on Basescan (mainnet / Sepolia only)
  if (
    process.env.BASESCAN_API_KEY &&
    network.name !== "localhost" &&
    network.name !== "hardhat"
  ) {
    console.log("\nWaiting 30s for block inclusion before verification...");
    await new Promise((r) => setTimeout(r, 30_000));
    try {
      await run("verify:verify", {
        address: tokenAddress,
        constructorArguments: [treasury],
      });
      console.log("Verification complete.");
    } catch (e: unknown) {
      console.warn(
        "Verification failed (retry with `hardhat verify --network base " +
          tokenAddress +
          " " +
          treasury +
          "`):",
        (e as Error).message
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
