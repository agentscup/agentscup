import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import * as fs from "fs";
import * as path from "path";

/**
 * Reads airdrop-merkle-input.csv, builds a StandardMerkleTree over
 * (address, amount_wei) tuples, and writes three artifacts:
 *
 *   merkle_tree.json  — full tree (import with StandardMerkleTree.load)
 *   merkle_root.txt   — bytes32 root used at contract deploy time
 *   claim_proofs.json — { [address]: { amount, proof[] } } for the UI
 *
 * Run: npx ts-node scripts/buildMerkleTree.ts
 */
async function main() {
  const airdropRoot =
    process.env.AIRDROP_ROOT || "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop";
  const inFile = path.join(airdropRoot, "airdrop-merkle-input.csv");
  if (!fs.existsSync(inFile)) {
    throw new Error(`Input not found: ${inFile}`);
  }

  const raw = fs.readFileSync(inFile, "utf8").trim().split("\n");
  const header = raw[0].split(",");
  const addrIdx = header.indexOf("address");
  const cupIdx = header.indexOf("cup_allocation");
  if (addrIdx < 0 || cupIdx < 0) {
    throw new Error(`CSV missing required columns address/cup_allocation`);
  }

  const values: [string, string][] = []; // [address, amount_wei]
  const meta: { address: string; cup: string; weight: string; cohorts: string }[] = [];
  let totalCup = 0n;
  for (let i = 1; i < raw.length; i++) {
    const p = raw[i].split(",");
    const addr = (p[addrIdx] || "").toLowerCase();
    if (!addr.startsWith("0x") || addr.length !== 42) continue;
    const cup = BigInt(p[cupIdx] ?? "0");
    if (cup === 0n) continue;
    const amountWei = cup * 10n ** 18n;
    values.push([addr, amountWei.toString()]);
    meta.push({
      address: addr,
      cup: cup.toString(),
      weight: p[1] ?? "",
      cohorts: p[2] ?? "",
    });
    totalCup += cup;
  }
  console.log(`[build] ${values.length} recipients, total = ${totalCup.toLocaleString()} CUP`);

  // StandardMerkleTree double-hashes each leaf under the hood:
  //   leaf = keccak256(bytes.concat(keccak256(abi.encode(...))))
  // The contract uses the same derivation.
  const tree = StandardMerkleTree.of(values, ["address", "uint256"]);
  const root = tree.root;
  console.log(`[build] merkle root: ${root}`);

  // Save tree
  const outDir = path.join(airdropRoot, "merkle");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "merkle_tree.json"),
    JSON.stringify(tree.dump(), null, 2)
  );
  fs.writeFileSync(path.join(outDir, "merkle_root.txt"), root + "\n");

  // Build per-address proof map for the UI
  const proofs: Record<string, { amount: string; cup: string; proof: string[]; cohorts: string }> = {};
  let idx = 0;
  for (const [addr] of tree.entries()) {
    const proof = tree.getProof(idx);
    const m = meta[idx];
    proofs[m.address] = {
      amount: (BigInt(m.cup) * 10n ** 18n).toString(),
      cup: m.cup,
      proof,
      cohorts: m.cohorts,
    };
    idx++;
  }
  fs.writeFileSync(
    path.join(outDir, "claim_proofs.json"),
    JSON.stringify(proofs, null, 1)
  );
  console.log(`[build] wrote ${Object.keys(proofs).length} proofs`);

  console.log(`\n══ OUTPUTS ══`);
  console.log(`  merkle_root.txt    ${path.join(outDir, "merkle_root.txt")}`);
  console.log(`  merkle_tree.json   ${path.join(outDir, "merkle_tree.json")}`);
  console.log(`  claim_proofs.json  ${path.join(outDir, "claim_proofs.json")}`);
  console.log(`\n══ CONTRACT ARGS ══`);
  console.log(`  token:          0x08d1c6b78e8aa80E0C505829C30C0f81F984a668`);
  console.log(`  merkleRoot:     ${root}`);
  console.log(`  claimDeadline:  0 (or Math.floor(Date.now()/1000) + 90*86400 for 90-day)`);
  console.log(`  owner:          0x59A5CBC684BfED4AA83Abce9Ec637c3F2b3634Dc`);
}

main().catch((e) => { console.error(e); process.exit(1); });
