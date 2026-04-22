import { ethers, run } from "hardhat";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys a small test MerkleDistributor seeded with the test wallet
 * only, funds it with 1M CUP, and writes the proof to frontend public
 * for the /claim-test page to consume.
 */
async function main() {
  const [s] = await ethers.getSigners();
  const signer = await s.getAddress();
  const CUP = "0x08d1c6b78e8aa80E0C505829C30C0f81F984a668";
  const TEST_WALLET = "0x1d4333f725ee240aea939cbAD3216332FB8495EB";
  const AMOUNT = 1_000_000n * 10n ** 18n;

  // Build tree (just one entry)
  const values: [string, string][] = [[TEST_WALLET.toLowerCase(), AMOUNT.toString()]];
  const tree = StandardMerkleTree.of(values, ["address", "uint256"]);
  const root = tree.root;
  const proof = tree.getProof(0);
  console.log(`Test wallet:  ${TEST_WALLET}`);
  console.log(`Amount:       1,000,000 CUP`);
  console.log(`Merkle root:  ${root}`);
  console.log(`Proof:        ${JSON.stringify(proof)}`);

  // Deploy distributor with root, no deadline (claim anytime for tests)
  const D = await ethers.getContractFactory("CupMerkleDistributor");
  const d = await D.deploy(CUP, root, 0, signer);
  await d.waitForDeployment();
  const addr = await d.getAddress();
  console.log(`\nTest distributor: ${addr}`);

  // Fund with 1M CUP
  const cup = await ethers.getContractAt("IERC20", CUP);
  const tx = await cup.transfer(addr, AMOUNT);
  await tx.wait();
  console.log(`Funded with 1M CUP (tx ${tx.hash})`);

  // Write test proof to frontend public
  const testProofFile = path.join(
    __dirname,
    "..",
    "..",
    "frontend",
    "public",
    "claim-proofs-test.json"
  );
  const data = {
    distributor: addr,
    test: {
      [TEST_WALLET.toLowerCase()]: {
        amount: AMOUNT.toString(),
        proof,
      },
    },
  };
  fs.writeFileSync(testProofFile, JSON.stringify(data, null, 2));
  console.log(`\nWrote test proof to ${testProofFile}`);

  // Sourcify verify
  try {
    await run("verify:verify", {
      address: addr,
      constructorArguments: [CUP, root, 0, signer],
    });
  } catch (e) {
    console.warn("[verify] partial:", (e as Error).message.slice(0, 200));
  }

  console.log(`\n═══ DONE ═══`);
  console.log(`Test distributor: ${addr}`);
  console.log(`Claim URL:        https://play.agentscup.com/claim-test`);
}

main().catch((e) => { console.error(e); process.exit(1); });
