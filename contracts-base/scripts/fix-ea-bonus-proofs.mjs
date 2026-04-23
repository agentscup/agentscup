// BUGFIX: regenerate claim_proofs_ea_bonus.json with ADDRESS keys
// (was broken — keyed by index like "0","1"... because we destructured
// tree.entries() wrong). The merkle ROOT is identical so the deployed
// distributor doesn't need to change — we just fix the lookup JSON
// the frontend consumes. Users who claimed main can now also claim bonus.

import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import fs from "node:fs";
import path from "node:path";

const ROOT = "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop";
const treeDump = JSON.parse(
  fs.readFileSync(path.join(ROOT, "merkle", "ea_bonus_tree.json"), "utf8")
);
const tree = StandardMerkleTree.load(treeDump);
console.log("Loaded tree, root:", tree.root);

const proofs = {};
for (const [i, v] of tree.entries()) {
  const addr = (v[0] + "").toLowerCase();
  const amount = String(v[1]);
  proofs[addr] = {
    amount,
    cup: (BigInt(amount) / 10n ** 18n).toString(),
    proof: tree.getProof(i),
  };
}
fs.writeFileSync(
  path.join(ROOT, "merkle", "claim_proofs_ea_bonus.json"),
  JSON.stringify(proofs, null, 1)
);
console.log("Wrote", Object.keys(proofs).length, "proofs keyed by address");

// Regenerate combined claim-proofs.json for frontend
const mainRaw = JSON.parse(
  fs.readFileSync(path.join(ROOT, "merkle", "claim_proofs.json"), "utf8")
);
const combined = {};
for (const [addr, info] of Object.entries(mainRaw)) {
  const a = addr.toLowerCase();
  combined[a] = combined[a] || {};
  combined[a].main = { amount: info.amount, proof: info.proof };
}
for (const [addr, info] of Object.entries(proofs)) {
  const a = addr.toLowerCase();
  combined[a] = combined[a] || {};
  combined[a].bonus = { amount: info.amount, proof: info.proof };
}
const outPath =
  "C:/Users/doguk/OneDrive/Desktop/agentscup/frontend/public/claim-proofs.json";
fs.writeFileSync(outPath, JSON.stringify(combined));
console.log(
  `Combined → ${outPath}: ${Object.keys(combined).length} unique addresses`
);

// Overlap sanity check
let mainCount = 0, bonusCount = 0, both = 0;
for (const v of Object.values(combined)) {
  if (v.main) mainCount++;
  if (v.bonus) bonusCount++;
  if (v.main && v.bonus) both++;
}
console.log(`  main only: ${mainCount - both}`);
console.log(`  bonus only: ${bonusCount - both}`);
console.log(`  both:      ${both}`);
