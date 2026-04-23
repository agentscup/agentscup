import { ethers, run } from "hardhat";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import * as fs from "fs";
import * as path from "path";

/** Continue the flat-69k rollout from where deployFlatDistributor.ts stopped. */
async function main() {
  const [deployer] = await ethers.getSigners();
  const from = await deployer.getAddress();

  const CUP_TOKEN = "0x08d1c6b78e8aa80E0C505829C30C0f81F984a668";
  const TREASURY = "0x59A5CBC684BfED4AA83Abce9Ec637c3F2b3634Dc";
  const FEE_WEI = 300_000_000_000_000n;
  const DIST = "0xBd8E2C1B8706BaAEB6e809026f57A7D808677268"; // from previous run
  const PER_USER_CUP = 69_000n;
  const PER_USER_WEI = PER_USER_CUP * 10n ** 18n;

  const proofsPath =
    "C:/Users/doguk/OneDrive/Desktop/agentscup/frontend/public/claim-proofs.json";
  const current = JSON.parse(fs.readFileSync(proofsPath, "utf8"));
  const addrs = Object.keys(current).map((a) => a.toLowerCase()).sort();
  const totalCup = BigInt(addrs.length) * PER_USER_CUP;
  const totalWei = totalCup * 10n ** 18n;

  const cup = await ethers.getContractAt("IERC20", CUP_TOKEN);
  const distBal = await cup.balanceOf(DIST);
  console.log(`Distributor current CUP: ${ethers.formatUnits(distBal, 18)}`);

  if (distBal < totalWei) {
    console.log("[1] Funding distributor...");
    const needed = totalWei - distBal;
    const tx = await cup.transfer(DIST, needed);
    console.log(`    tx ${tx.hash}`);
    await tx.wait();
    console.log(`    funded +${ethers.formatUnits(needed, 18)} CUP`);
  } else {
    console.log("[1] Already funded ✓");
  }

  // Deploy router
  console.log("[2] Deploying CupClaimRouter...");
  const R = await ethers.getContractFactory("CupClaimRouter");
  const r = await R.deploy(DIST, DIST, TREASURY, FEE_WEI, from);
  await r.waitForDeployment();
  const routerAddr = await r.getAddress();
  console.log(`    @ ${routerAddr}`);

  // Write proofs
  console.log("[3] Writing new claim-proofs.json...");
  const values: [string, string][] = addrs.map((a) => [a, PER_USER_WEI.toString()]);
  const tree = StandardMerkleTree.of(values, ["address", "uint256"]);
  const newProofs: Record<string, { main: { amount: string; proof: string[] } }> = {};
  for (const [i, v] of tree.entries()) {
    const a = (v[0] + "").toLowerCase();
    newProofs[a] = { main: { amount: String(v[1]), proof: tree.getProof(i) } };
  }
  fs.writeFileSync(proofsPath, JSON.stringify(newProofs));
  fs.writeFileSync(
    "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/merkle/flat69k_tree.json",
    JSON.stringify(tree.dump(), null, 2)
  );
  fs.writeFileSync(
    "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/merkle/flat69k_root.txt",
    tree.root + "\n"
  );
  console.log(`    wrote ${Object.keys(newProofs).length} proofs`);

  // deployments/base.json update
  const deplFile = path.join(__dirname, "..", "deployments", "base.json");
  const depl = JSON.parse(fs.readFileSync(deplFile, "utf8"));
  depl.contracts.CupMerkleDistributor_Flat69k = DIST;
  depl.contracts.CupClaimRouter_Flat69k = routerAddr;
  depl.merkle.flat69kRoot = tree.root;
  depl.totals.flat69kPool = totalCup.toString();
  depl.totals.flat69kRecipients = addrs.length;
  fs.writeFileSync(deplFile, JSON.stringify(depl, null, 2));

  try {
    await run("verify:verify", {
      address: routerAddr,
      constructorArguments: [DIST, DIST, TREASURY, FEE_WEI, from],
    });
  } catch (e) { console.warn("verify:", (e as Error).message.slice(0, 120)); }

  console.log("\n═══ DONE ═══");
  console.log(`Distributor: ${DIST}`);
  console.log(`Router:      ${routerAddr}`);
  console.log(`Root:        ${tree.root}`);
  console.log(`Recipients:  ${addrs.length}`);
  console.log(`Per-user:    ${PER_USER_CUP.toLocaleString()} CUP`);
  console.log(`\nUpdate NEXT_PUBLIC_CLAIM_ROUTER_ADDRESS=${routerAddr}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
