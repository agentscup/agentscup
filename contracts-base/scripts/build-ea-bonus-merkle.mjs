// Build the EARLY-ACCESS BONUS merkle input: 80,000,000 CUP split
// flat across every current early-access user (EVM wallet bound).
//
// Source: early-access-users.csv (latest Supabase snapshot)
// Output: ea-bonus-input.csv (for buildMerkleTree.ts)
// Output: ea-bonus-root.txt + claim_proofs_ea_bonus.json

import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import fs from "node:fs";
import path from "node:path";

const ROOT = "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop";
const POOL = 80_000_000;

const raw = fs.readFileSync(path.join(ROOT, "early-access-users.csv"), "utf8").trim().split("\n");
const header = raw[0].split(",");
const addrIdx = header.indexOf("address");

const addrs = new Set();
for (let i = 1; i < raw.length; i++) {
  const a = (raw[i].split(",")[addrIdx] || "").trim().toLowerCase();
  if (a.startsWith("0x") && a.length === 42) addrs.add(a);
}
const list = [...addrs];
console.log(`[init] ${list.length} unique EA addresses`);

// Flat allocation
const perUser = Math.floor(POOL / list.length);
const dust = POOL - perUser * list.length;
console.log(`[alloc] ${perUser.toLocaleString()} CUP per user, ${dust} dust`);

const values = list.map((a, i) => {
  const amount = i === 0 ? perUser + dust : perUser; // dust to first
  return [a, (BigInt(amount) * 10n ** 18n).toString()];
});

const tree = StandardMerkleTree.of(values, ["address", "uint256"]);
const root = tree.root;
console.log(`[build] merkle root: ${root}`);

// Save
const outDir = path.join(ROOT, "merkle");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "ea_bonus_tree.json"), JSON.stringify(tree.dump(), null, 2));
fs.writeFileSync(path.join(outDir, "ea_bonus_root.txt"), root + "\n");

// CSV summary
const csvOut = path.join(ROOT, "ea-bonus-input.csv");
const lines = values.map(([a, amt]) => `${a},${Number(BigInt(amt) / 10n ** 18n).toLocaleString("en-US").replace(/,/g, "")}`);
fs.writeFileSync(csvOut, "address,cup_allocation\n" + lines.join("\n") + "\n");

// Claim proofs for UI
const proofs = {};
let idx = 0;
for (const [addr] of tree.entries()) {
  const proof = tree.getProof(idx);
  const amount = values[idx][1];
  proofs[addr] = { amount, cup: (BigInt(amount) / 10n ** 18n).toString(), proof };
  idx++;
}
fs.writeFileSync(path.join(outDir, "claim_proofs_ea_bonus.json"), JSON.stringify(proofs, null, 1));

console.log(`\n[done] artifacts:`);
console.log(`  ${outDir}/ea_bonus_root.txt`);
console.log(`  ${outDir}/ea_bonus_tree.json`);
console.log(`  ${outDir}/claim_proofs_ea_bonus.json`);
console.log(`  ${csvOut}`);
console.log(`\n[deploy args]`);
console.log(`  token:         0x08d1c6b78e8aa80E0C505829C30C0f81F984a668`);
console.log(`  merkleRoot:    ${root}`);
console.log(`  claimDeadline: 0 (no expiry) or 90-day`);
console.log(`  owner:         0x59A5CBC684BfED4AA83Abce9Ec637c3F2b3634Dc`);
