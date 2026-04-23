/**
 * Manually pays out CUP to a winner whose bot-match settlement failed
 * inside the socket handler. Reads stuck matchIds from on-chain slot
 * state, calls forfeitAll to drain the 50k CUP deposit back to the
 * player, then transfers an extra 50k CUP from treasury for the win
 * bonus — same flow as a working bot-match settle, just scripted.
 *
 *   cd backend && npx ts-node src/scripts/recoverStuckMatches.ts
 */
import dotenv from "dotenv";
dotenv.config();

import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

import AgentsCupMatchEscrowAbi from "../abi/AgentsCupMatchEscrowV2.json";
import AgentsCupTokenAbi from "../abi/AgentsCupToken.json";

// Stuck matches from Railway logs. Slot 0 is Funded with 50k CUP for
// 0x1d4333f7 but the socket handler's forfeitAll call failed at
// settle time. Recover manually below.
const STUCK = [
  { matchId: "0xf4b2956aebcd5837d0a95525bb5b11d560dfedc3ad7f6b8fae5332e23690bc59", winner: "0x1d4333f725ee240aea939cbAD3216332FB8495EB" },
  { matchId: "0x72d6bd27e4c7ff61458ea6e14db13df1c7e25e6fb68f49b8c2d11a4eab03c8a5", winner: "0x1d4333f725ee240aea939cbAD3216332FB8495EB" },
];

const ESCROW = "0x2ec18B8dE83333bAcCcb0B08e03C24F8fD834517" as const;
const CUP = "0x08d1c6b78e8aa80E0C505829C30C0f81F984a668" as const;
const ENTRY = 50_000n * 10n ** 18n;

async function main() {
  const pk = (process.env.TREASURY_PRIVATE_KEY || "").trim();
  if (!pk) throw new Error("TREASURY_PRIVATE_KEY not set in .env");
  const key = (pk.startsWith("0x") ? pk : `0x${pk}`) as Hex;
  const account = privateKeyToAccount(key);

  const client = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org") });
  const wallet = createWalletClient({ account, chain: base, transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org") });

  console.log("Operator:", account.address);

  for (const { matchId, winner } of STUCK) {
    console.log(`\n=== match ${matchId.slice(0, 14)}... winner ${winner} ===`);

    // Check current slot state.
    const [slot0, slot1] = (await Promise.all([
      client.readContract({ address: ESCROW, abi: AgentsCupMatchEscrowAbi, functionName: "slots", args: [matchId as Hex, 0] }),
      client.readContract({ address: ESCROW, abi: AgentsCupMatchEscrowAbi, functionName: "slots", args: [matchId as Hex, 1] }),
    ])) as [readonly [string, bigint, number], readonly [string, bigint, number]];
    console.log(`  slot0: player=${slot0[0]} amount=${slot0[1]} status=${slot0[2]}`);
    console.log(`  slot1: player=${slot1[0]} amount=${slot1[1]} status=${slot1[2]}`);

    const anyFunded = slot0[2] === 1 || slot1[2] === 1;
    if (!anyFunded) {
      console.log("  ⚠ no funded slot — already settled, skipping forfeit");
    } else {
      console.log("  [1/2] forfeitAll → return player's 50k CUP");
      const forfeitHash = await wallet.writeContract({
        address: ESCROW,
        abi: AgentsCupMatchEscrowAbi,
        functionName: "forfeitAll",
        args: [matchId as Hex, getAddress(winner)],
      });
      console.log(`         tx ${forfeitHash}`);
      const r1 = await client.waitForTransactionReceipt({ hash: forfeitHash, timeout: 60_000 });
      console.log(`         status: ${r1.status}`);
    }

    console.log("  [2/2] transfer bonus 50k CUP → winner");
    const topUpHash = await wallet.writeContract({
      address: CUP,
      abi: AgentsCupTokenAbi,
      functionName: "transfer",
      args: [getAddress(winner), ENTRY],
    });
    console.log(`         tx ${topUpHash}`);
    const r2 = await client.waitForTransactionReceipt({ hash: topUpHash, timeout: 60_000 });
    console.log(`         status: ${r2.status}`);
  }

  console.log("\nDone.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
