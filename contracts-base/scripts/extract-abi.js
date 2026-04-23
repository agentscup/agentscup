/**
 * Extracts Hardhat contract ABIs into three sibling consumers:
 *
 *   contracts-base/abi/*.json      — canonical location for scripts
 *                                    living in this workspace
 *   backend/src/abi/*.json         — imported by backend routes /
 *                                    evm helpers (stays inside
 *                                    rootDir for ts-node/tsc)
 *   frontend/src/abi/*.json        — imported by frontend libs
 *
 * Keeping three copies beats either (a) moving tsconfig rootDirs
 * around each service or (b) shipping the whole Hardhat artifact
 * tree into prod bundles. Run after every `hardhat compile`:
 *
 *   npm run abi:extract              # from contracts-base
 *
 * or automatically via the `build` script.
 */
const fs = require("fs");
const path = require("path");

const CONTRACTS = [
  "AgentsCupPackStore",
  "AgentsCupMarketplace",
  "AgentsCupMatchEscrow",
  "AgentsCupPackStoreV2",
  "AgentsCupMarketplaceV2",
  "AgentsCupMatchEscrowV2",
  "AgentsCupToken",
];

const root = path.join(__dirname, "..");
const repoRoot = path.join(root, "..");

const outDirs = [
  path.join(root, "abi"),
  path.join(repoRoot, "backend", "src", "abi"),
  path.join(repoRoot, "frontend", "src", "abi"),
];
outDirs.forEach((d) => fs.mkdirSync(d, { recursive: true }));

for (const name of CONTRACTS) {
  const artifactPath = path.join(
    root,
    "artifacts",
    "contracts",
    `${name}.sol`,
    `${name}.json`
  );
  if (!fs.existsSync(artifactPath)) {
    console.error(
      `[abi] missing artifact ${artifactPath}. Run npm run build first.`
    );
    process.exitCode = 1;
    continue;
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const json = JSON.stringify(artifact.abi, null, 2);
  for (const dir of outDirs) {
    const dest = path.join(dir, `${name}.json`);
    fs.writeFileSync(dest, json);
    console.log(
      `[abi] wrote ${path.relative(repoRoot, dest)} (${artifact.abi.length} entries)`
    );
  }
}
