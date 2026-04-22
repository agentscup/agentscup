import { ethers } from "hardhat";

async function main() {
  const CUP = "0x08d1c6b78e8aa80E0C505829C30C0f81F984a668";
  const DIST = "0xf39CfAa340C4cc889a7898E178c312a36316ef2D";
  const AMOUNT = 1_000_000n * 10n ** 18n;
  const cup = await ethers.getContractAt("IERC20", CUP);
  const tx = await cup.transfer(DIST, AMOUNT);
  console.log(`tx: ${tx.hash}`);
  await tx.wait();
  console.log(`funded.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
