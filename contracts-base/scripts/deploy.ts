import { ethers, network, run } from "hardhat";

/**
 * Deploy AgentsCupPackStore + AgentsCupMarketplace to the configured
 * network. Reads TREASURY_ADDRESS / ADMIN_ADDRESS / MARKETPLACE_FEE_BPS
 * from env with sensible fallbacks. Prints the final addresses so the
 * backend + frontend can be updated.
 *
 *   npm run deploy:local       # hardhat localhost (run `npm run node` first)
 *   npm run deploy:sepolia     # Base Sepolia testnet
 *   npm run deploy:base        # Base mainnet
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);

  const treasury = (process.env.TREASURY_ADDRESS || deployerAddress) as string;
  const admin = (process.env.ADMIN_ADDRESS || deployerAddress) as string;
  const feeBps = Number(process.env.MARKETPLACE_FEE_BPS ?? 250); // 2.5% default

  console.log("\n=== Agents Cup — Base deployment ===");
  console.log(`Network : ${network.name} (chainId=${network.config.chainId})`);
  console.log(`Deployer: ${deployerAddress}`);
  console.log(`Balance : ${ethers.formatEther(balance)} ETH`);
  console.log(`Treasury: ${treasury}`);
  console.log(`Admin   : ${admin}`);
  console.log(`Fee bps : ${feeBps}\n`);

  if (balance === 0n && network.name !== "localhost" && network.name !== "hardhat") {
    throw new Error("Deployer has 0 ETH — fund it before deploying.");
  }

  // ── AgentsCupPackStore ───────────────────────────────────────────
  console.log("Deploying AgentsCupPackStore...");
  const PackStore = await ethers.getContractFactory("AgentsCupPackStore");
  const packStore = await PackStore.deploy(treasury, admin);
  await packStore.waitForDeployment();
  const packStoreAddress = await packStore.getAddress();
  console.log(`  AgentsCupPackStore @ ${packStoreAddress}`);

  // ── AgentsCupMarketplace ─────────────────────────────────────────
  console.log("Deploying AgentsCupMarketplace...");
  const Marketplace = await ethers.getContractFactory("AgentsCupMarketplace");
  const marketplace = await Marketplace.deploy(treasury, feeBps, admin);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(`  AgentsCupMarketplace @ ${marketplaceAddress}`);

  console.log("\n=== Summary ===");
  console.log(JSON.stringify({
    network: network.name,
    chainId: network.config.chainId,
    deployer: deployerAddress,
    contracts: {
      AgentsCupPackStore: packStoreAddress,
      AgentsCupMarketplace: marketplaceAddress,
    },
    config: { treasury, admin, feeBps },
  }, null, 2));

  // Optional: auto-verify on Basescan if API key is set
  if (process.env.BASESCAN_API_KEY && network.name !== "localhost" && network.name !== "hardhat") {
    console.log("\nVerifying on Basescan...");
    try {
      await run("verify:verify", {
        address: packStoreAddress,
        constructorArguments: [treasury, admin],
      });
      await run("verify:verify", {
        address: marketplaceAddress,
        constructorArguments: [treasury, feeBps, admin],
      });
      console.log("Verification complete.");
    } catch (e: unknown) {
      console.warn("Verification failed (you can retry with `npm run verify:*`):", (e as Error).message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
