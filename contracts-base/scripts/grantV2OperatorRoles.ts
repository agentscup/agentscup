/**
 * Grant OPERATOR_ROLE to the backend's hot wallet on MatchEscrowV2.
 *
 * Discovered on 2026-04-23: V2 contracts were deployed with
 * admin=0x59A5...(the deployer itself). The backend's settle signer
 * is a separate hot wallet 0x5A31... (TREASURY_PRIVATE_KEY in
 * Railway env). MatchEscrowV2's `onlyRole(OPERATOR_ROLE)` check
 * rejects 0x5A31's payoutWinner/refundDraw/forfeitAll calls, which
 * surfaced as "contract function forfeitAll reverted" in the bot-win
 * settle path — players won bots but never got their 100k CUP.
 *
 * This script runs once as the admin (deployer) and grants the
 * backend operator role on the escrow. After it lands, the socket
 * handler's normal settle flow should work end-to-end.
 */
import { ethers, network } from "hardhat";

const ESCROW = "0x2ec18B8dE83333bAcCcb0B08e03C24F8fD834517";
// Keep backend wallet address in sync with Railway's TREASURY_PRIVATE_KEY.
const BACKEND_OP = "0x5A31f465064Cb00a99F0885c480927B5ea906568";
const OPERATOR_ROLE = "0x97667070c54ef182b0f5858b034beac1b6f3089aa2d3188bb1e8929f4fa9b929";

async function main() {
  const [admin] = await ethers.getSigners();
  console.log(`Network:     ${network.name}`);
  console.log(`Admin:       ${await admin.getAddress()}`);
  console.log(`Escrow:      ${ESCROW}`);
  console.log(`Grant op to: ${BACKEND_OP}\n`);

  const escrow = await ethers.getContractAt("AgentsCupMatchEscrowV2", ESCROW);

  const already = await escrow.hasRole(OPERATOR_ROLE, BACKEND_OP);
  if (already) {
    console.log("✓ Already has OPERATOR_ROLE, nothing to do");
    return;
  }

  console.log("[1/1] grantRole(OPERATOR_ROLE, backendOp)...");
  const tx = await escrow.grantRole(OPERATOR_ROLE, BACKEND_OP);
  console.log(`      tx ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`      status: ${receipt?.status === 1 ? "✓" : "✗"} block ${receipt?.blockNumber}`);

  const confirm = await escrow.hasRole(OPERATOR_ROLE, BACKEND_OP);
  console.log(`\nPost-grant hasRole: ${confirm}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
