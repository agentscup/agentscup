import { ethers, network, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy CupClaimRouter — routes combined claims to both distributors
 * and charges a fixed $1-equivalent ETH fee per claim.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);

  const MAIN = "0x069B6a593aDb9310DF0B51cD2FA06b0dCf1E3A66";
  const BONUS = "0x5e5b8F1e570C0db669EE83c6f91b9d144F42097A";
  const TREASURY = "0x59A5CBC684BfED4AA83Abce9Ec637c3F2b3634Dc";
  // $1 @ ETH ~$3500 = 0.0002857 ETH → round up to 0.0003 ETH for safety
  const INITIAL_FEE_WEI = 300_000_000_000_000n; // 0.0003 ETH
  const OWNER = TREASURY;

  console.log(`\n═══ CupClaimRouter deployment ═══`);
  console.log(`Network:     ${network.name} (${network.config.chainId})`);
  console.log(`Deployer:    ${deployerAddress}`);
  console.log(`Balance:     ${ethers.formatEther(balance)} ETH`);
  console.log(`Main:        ${MAIN}`);
  console.log(`Bonus:       ${BONUS}`);
  console.log(`Treasury:    ${TREASURY}`);
  console.log(`Fee (wei):   ${INITIAL_FEE_WEI} (~0.0003 ETH, ~$1)`);
  console.log(`Owner:       ${OWNER}\n`);

  if (balance === 0n && network.name !== "localhost" && network.name !== "hardhat") {
    throw new Error("Deployer has 0 ETH");
  }

  console.log("Deploying CupClaimRouter...");
  const R = await ethers.getContractFactory("CupClaimRouter");
  const r = await R.deploy(MAIN, BONUS, TREASURY, INITIAL_FEE_WEI, OWNER);
  await r.waitForDeployment();
  const addr = await r.getAddress();
  const tx = r.deploymentTransaction();
  console.log(`  @ ${addr}`);
  console.log(`  tx: ${tx?.hash}`);

  // Save
  const outDir = path.join(__dirname, "..", "deployments");
  const outFile = path.join(outDir, `${network.name}.json`);
  let deployment: Record<string, any> = {};
  if (fs.existsSync(outFile)) deployment = JSON.parse(fs.readFileSync(outFile, "utf8"));
  deployment.contracts = deployment.contracts || {};
  deployment.contracts.CupClaimRouter = addr;
  deployment.claimRouter = {
    feeWei: INITIAL_FEE_WEI.toString(),
    feeEth: "0.0003",
    treasury: TREASURY,
    mainDistributor: MAIN,
    bonusDistributor: BONUS,
  };
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));

  // Sourcify verify
  try {
    await run("verify:verify", {
      address: addr,
      constructorArguments: [MAIN, BONUS, TREASURY, INITIAL_FEE_WEI, OWNER],
    });
  } catch (e) {
    console.warn("[verify] partial:", (e as Error).message.slice(0, 200));
  }

  console.log(`\n═══ DONE ═══`);
  console.log(`Router deployed at: ${addr}`);
  console.log(`Claim fee: 0.0003 ETH (~$1)`);
  console.log(`Fees routed to: ${TREASURY}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
