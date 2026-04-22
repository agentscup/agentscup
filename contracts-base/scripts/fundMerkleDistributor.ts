import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Transfers 220,000,000 CUP from the deployer/treasury to the
 * MerkleDistributor. Call AFTER deployMerkleDistributor.ts.
 */
async function main() {
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();

  const cupAddress =
    process.env.CUP_TOKEN_ADDRESS ||
    "0x08d1c6b78e8aa80E0C505829C30C0f81F984a668";
  const deploymentsFile = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  const deployment = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
  const distributorAddress = deployment.contracts?.CupMerkleDistributor;
  if (!distributorAddress) {
    throw new Error("CupMerkleDistributor not in deployments — run deploy script first.");
  }

  const amount = 220_000_000n * 10n ** 18n; // 220M CUP

  console.log(`Network:     ${network.name}`);
  console.log(`Signer:      ${signerAddress}`);
  console.log(`CUP token:   ${cupAddress}`);
  console.log(`Distributor: ${distributorAddress}`);
  console.log(`Amount:      ${(Number(amount / 10n ** 18n)).toLocaleString()} CUP`);

  const cup = await ethers.getContractAt("IERC20", cupAddress);
  const bal = await cup.balanceOf(signerAddress);
  console.log(`Signer CUP:  ${ethers.formatUnits(bal, 18)}`);
  if (bal < amount) throw new Error("Signer does not hold enough CUP");

  const tx = await cup.transfer(distributorAddress, amount);
  console.log(`tx sent:     ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`confirmed in block ${receipt?.blockNumber}`);

  const distBal = await cup.balanceOf(distributorAddress);
  console.log(`\nDistributor CUP balance now: ${ethers.formatUnits(distBal, 18)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
