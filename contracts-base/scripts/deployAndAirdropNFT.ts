import { ethers, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys CupTopHolderNFT and airdrops 1 NFT to each address in
 * agentscup-airdrop/cup-top200-eoa-only.csv (123 addresses).
 */
const PLACEHOLDER_URI =
  "https://agentscup.com/nft/top-holder/{id}.json"; // owner can setURI later

async function main() {
  const [deployer] = await ethers.getSigners();
  const from = await deployer.getAddress();

  console.log(`Deployer: ${from}`);
  console.log(`ETH bal:  ${ethers.formatEther(await ethers.provider.getBalance(from))}`);

  // Load recipient list
  const csv = fs.readFileSync(
    "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/cup-top200-eoa-only.csv",
    "utf8"
  ).trim().split("\n");
  const recipients = csv.slice(1).map((l) => l.split(",")[1]).filter((a) => /^0x[a-fA-F0-9]{40}$/.test(a));
  console.log(`Recipients: ${recipients.length}`);

  // Deploy
  console.log("[1/2] Deploying CupTopHolderNFT...");
  const NFT = await ethers.getContractFactory("CupTopHolderNFT");
  const nft = await NFT.deploy(PLACEHOLDER_URI, from);
  await nft.waitForDeployment();
  const addr = await nft.getAddress();
  console.log(`       @ ${addr}`);

  // Airdrop in one tx
  console.log(`[2/2] Minting ${recipients.length} NFTs in one tx...`);
  const tx = await nft.airdrop(recipients);
  console.log(`       tx ${tx.hash}`);
  const r = await tx.wait();
  console.log(`       confirmed block ${r?.blockNumber}, gas ${r?.gasUsed}`);

  // Save to deployments
  const deplFile = path.join(__dirname, "..", "deployments", "base.json");
  const depl = JSON.parse(fs.readFileSync(deplFile, "utf8"));
  depl.contracts.CupTopHolderNFT = addr;
  depl.nftAirdrop = {
    tokenId: 1,
    recipients: recipients.length,
    tx: tx.hash,
    airdroppedAt: new Date().toISOString(),
  };
  fs.writeFileSync(deplFile, JSON.stringify(depl, null, 2));

  // Verify via Sourcify + Etherscan (we have API key now)
  try {
    await run("verify:verify", {
      address: addr,
      constructorArguments: [PLACEHOLDER_URI, from],
    });
    console.log("       verified ✓");
  } catch (e) {
    console.warn("       verify skipped:", (e as Error).message.slice(0, 150));
  }

  console.log(`\n═══ NFT AIRDROP COMPLETE ═══`);
  console.log(`Contract:    ${addr}`);
  console.log(`Token ID:    1`);
  console.log(`Recipients:  ${recipients.length}`);
  console.log(`BaseScan:    https://basescan.org/address/${addr}`);
  console.log(`\nOwner controls:`);
  console.log(`  setURI(newuri) — update metadata once art is ready`);
  console.log(`  airdrop(addrs[]) — mint more later to new addresses`);
}

main().catch((e) => { console.error(e); process.exit(1); });
