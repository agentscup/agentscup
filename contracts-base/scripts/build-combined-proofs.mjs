// Combine main + EA bonus proofs into ONE file for the frontend.
// Output shape:
//   { [addressLower]: { main?: {amount, proof}, bonus?: {amount, proof} } }

import fs from "node:fs";
import path from "node:path";

const ROOT = "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/merkle";
const mainRaw = JSON.parse(fs.readFileSync(path.join(ROOT, "claim_proofs.json"), "utf8"));
const bonusRaw = JSON.parse(fs.readFileSync(path.join(ROOT, "claim_proofs_ea_bonus.json"), "utf8"));

const combined = {};
for (const [addr, info] of Object.entries(mainRaw)) {
  const a = addr.toLowerCase();
  combined[a] = combined[a] || {};
  combined[a].main = { amount: info.amount, proof: info.proof };
}
for (const [addr, info] of Object.entries(bonusRaw)) {
  const a = addr.toLowerCase();
  combined[a] = combined[a] || {};
  combined[a].bonus = { amount: info.amount, proof: info.proof };
}

const outPath = "C:/Users/doguk/OneDrive/Desktop/agentscup/frontend/public/claim-proofs.json";
fs.writeFileSync(outPath, JSON.stringify(combined));
console.log(`Combined ${Object.keys(combined).length} unique addresses → ${outPath}`);
