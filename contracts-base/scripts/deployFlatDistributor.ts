import { ethers, run } from "hardhat";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import * as fs from "fs";
import * as path from "path";

/**
 * Replace the tiered main+bonus airdrop with a FLAT 69,000 CUP per
 * address distributor covering every original claim-proofs.json entry
 * (1,942 addresses). Old distributors stay live but frontend routes
 * to this new flat distributor + new router going forward.
 *
 * Deploys in one run:
 *   1. Build merkle tree (flat 69k per address)
 *   2. Deploy CupMerkleDistributor with the new root
 *   3. Fund with 1,942 × 69,000 = ~134M CUP
 *   4. Deploy new CupClaimRouter (main = bonus = new distributor;
 *      bonus slot is never called since frontend sends bonusAmount=0)
 *   5. Write new proofs to frontend/public/claim-proofs.json
 *   6. Print env updates for Vercel
 */

const PER_USER_CUP = 69_000n;
const PER_USER_WEI = PER_USER_CUP * 10n ** 18n;
const CUP_TOKEN = "0x08d1c6b78e8aa80E0C505829C30C0f81F984a668";
const TREASURY = "0x59A5CBC684BfED4AA83Abce9Ec637c3F2b3634Dc";
const FEE_WEI = 300_000_000_000_000n; // 0.0003 ETH

async function main() {
  const [deployer] = await ethers.getSigners();
  const from = await deployer.getAddress();
  const eth = await ethers.provider.getBalance(from);

  // ─── 1. Load existing 1,942 addresses ──────────────────────
  const proofsPath =
    "C:/Users/doguk/OneDrive/Desktop/agentscup/frontend/public/claim-proofs.json";
  const current = JSON.parse(fs.readFileSync(proofsPath, "utf8"));
  const addrs = Object.keys(current).map((a) => a.toLowerCase()).sort();
  console.log(`Addresses in flat airdrop: ${addrs.length}`);

  const values: [string, string][] = addrs.map((a) => [a, PER_USER_WEI.toString()]);
  const tree = StandardMerkleTree.of(values, ["address", "uint256"]);
  const root = tree.root;
  const totalCup = BigInt(addrs.length) * PER_USER_CUP;
  const totalWei = totalCup * 10n ** 18n;
  console.log(`Merkle root:   ${root}`);
  console.log(`Total to fund: ${totalCup.toLocaleString()} CUP`);
  console.log(`Deployer ETH:  ${ethers.formatEther(eth)} ETH`);
  console.log("");

  // ─── 2. Deploy new distributor (no deadline = claim forever) ──
  console.log("[1/5] Deploying new CupMerkleDistributor (flat 69k)...");
  const D = await ethers.getContractFactory("CupMerkleDistributor");
  const d = await D.deploy(CUP_TOKEN, root, 0n, from);
  await d.waitForDeployment();
  const distAddr = await d.getAddress();
  console.log(`     @ ${distAddr}`);

  // ─── 3. Fund distributor ──────────────────────────────────
  console.log("[2/5] Funding distributor...");
  const cup = await ethers.getContractAt("IERC20", CUP_TOKEN);
  const fundTx = await cup.transfer(distAddr, totalWei);
  await fundTx.wait();
  console.log(`     funded ${totalCup.toLocaleString()} CUP (tx ${fundTx.hash})`);

  // ─── 4. Deploy new router (main=bonus=same dist) ──────────
  console.log("[3/5] Deploying new CupClaimRouter (single-dist mode)...");
  const R = await ethers.getContractFactory("CupClaimRouter");
  const r = await R.deploy(distAddr, distAddr, TREASURY, FEE_WEI, from);
  await r.waitForDeployment();
  const routerAddr = await r.getAddress();
  console.log(`     @ ${routerAddr}`);

  // ─── 5. Write new proofs to frontend ──────────────────────
  console.log("[4/5] Writing new claim-proofs.json...");
  const newProofs: Record<string, {
    main: { amount: string; proof: string[] };
  }> = {};
  for (const [i, v] of tree.entries()) {
    const a = (v[0] + "").toLowerCase();
    newProofs[a] = {
      main: { amount: String(v[1]), proof: tree.getProof(i) },
    };
  }
  fs.writeFileSync(proofsPath, JSON.stringify(newProofs));
  console.log(`     wrote ${Object.keys(newProofs).length} proofs to ${proofsPath}`);

  // Save tree dump too for future operations
  const dumpPath =
    "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/merkle/flat69k_tree.json";
  fs.writeFileSync(dumpPath, JSON.stringify(tree.dump(), null, 2));
  fs.writeFileSync(
    path.join(path.dirname(dumpPath), "flat69k_root.txt"),
    root + "\n"
  );

  // ─── 6. Update deployments file ───────────────────────────
  const deplFile = path.join(__dirname, "..", "deployments", "base.json");
  const depl = JSON.parse(fs.readFileSync(deplFile, "utf8"));
  depl.contracts.CupMerkleDistributor_Flat69k = distAddr;
  depl.contracts.CupClaimRouter_Flat69k = routerAddr;
  depl.merkle.flat69kRoot = root;
  depl.totals.flat69kPool = totalCup.toString();
  depl.totals.flat69kRecipients = addrs.length;
  fs.writeFileSync(deplFile, JSON.stringify(depl, null, 2));

  // ─── Done ────────────────────────────────────────────────
  console.log("[5/5] Verification (best-effort)...");
  try {
    await run("verify:verify", {
      address: distAddr,
      constructorArguments: [CUP_TOKEN, root, 0n, from],
    });
  } catch (e) {
    console.warn("     dist verify:", (e as Error).message.slice(0, 120));
  }
  try {
    await run("verify:verify", {
      address: routerAddr,
      constructorArguments: [distAddr, distAddr, TREASURY, FEE_WEI, from],
    });
  } catch (e) {
    console.warn("     router verify:", (e as Error).message.slice(0, 120));
  }

  console.log("\n═══════════════ DEPLOY COMPLETE ═══════════════");
  console.log(`New Distributor: ${distAddr}`);
  console.log(`New Router:      ${routerAddr}`);
  console.log(`Merkle root:     ${root}`);
  console.log(`Funded:          ${totalCup.toLocaleString()} CUP`);
  console.log(`Recipients:      ${addrs.length}`);
  console.log(`Per-user:        ${PER_USER_CUP.toLocaleString()} CUP`);
  console.log(`Claim fee:       0.0003 ETH (~$1)`);
  console.log("\nFrontend env update:");
  console.log(`  NEXT_PUBLIC_CLAIM_ROUTER_ADDRESS=${routerAddr}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
