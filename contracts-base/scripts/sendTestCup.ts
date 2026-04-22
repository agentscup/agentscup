import { ethers } from "hardhat";

async function main() {
  const [s] = await ethers.getSigners();
  const signer = await s.getAddress();
  const CUP = "0x08d1c6b78e8aa80E0C505829C30C0f81F984a668";
  const TEST = "0x1d4333f725ee240aea939cbAD3216332FB8495EB";
  const AMOUNT = 1_000_000n * 10n ** 18n; // 1M CUP test allocation

  const cup = await ethers.getContractAt("IERC20", CUP);
  console.log(`Signer: ${signer}`);
  console.log(`Sending 1,000,000 CUP → ${TEST}`);
  const tx = await cup.transfer(TEST, AMOUNT);
  console.log(`tx: ${tx.hash}`);
  await tx.wait();
  const bal = await cup.balanceOf(TEST);
  console.log(`Test wallet CUP: ${ethers.formatUnits(bal, 18)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
