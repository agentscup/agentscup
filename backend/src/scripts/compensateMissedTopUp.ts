/**
 * One-off compensation — sends the 0.001 ETH top-up that failed due
 * to the parallel-tx nonce race in the old bot-win settlement code.
 *
 * Context: match bot_1776845213098_zu1lng, player won 9-0 against
 * QUANTUM KNIGHTS on 2026-04-22. The forfeitMatch refund landed but
 * the treasury top-up leg hit "replacement transaction underpriced"
 * because both txs shared the treasury signer's nonce and raced.
 * Sequential-tx fix deployed afterwards; this script hand-compensates
 * the affected winner so their first match feels right.
 */
// dotenv must run before any import that reads process.env —
// lib/evm reads TREASURY_PRIVATE_KEY at module evaluation time so
// loading env after the import leaves the signer unconfigured.
import dotenv from "dotenv";
dotenv.config();

import { transferEth } from "../lib/evm";

const RECIPIENT = "0x81243e05E481e77Da98A3EB2541B5d6ED33294Ba";
const AMOUNT_WEI = 1_000_000_000_000_000n; // 0.001 ETH
// Remaining: only the 17-2 match top-up is still outstanding — the
// earlier runs already covered the other two.
const MISSED_COUNT = 1;

async function main() {
  console.log(
    `Compensating ${RECIPIENT} with ${MISSED_COUNT} × 0.001 ETH (missed bot-win top-ups)`
  );
  for (let i = 1; i <= MISSED_COUNT; i++) {
    console.log(`  [${i}/${MISSED_COUNT}] sending 0.001 ETH...`);
    const res = await transferEth(RECIPIENT, AMOUNT_WEI);
    if (!res.success) {
      console.error(`  ✗ transfer ${i} failed:`, res.error);
      process.exit(1);
    }
    console.log(`  ✓ tx: ${res.txHash}`);
  }
  console.log(`\nAll ${MISSED_COUNT} compensations sent.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
