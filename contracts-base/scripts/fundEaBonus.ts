import { ethers } from "hardhat";

async function main() {
  const [s] = await ethers.getSigners();
  const signer = await s.getAddress();
  const CUP = "0x08d1c6b78e8aa80E0C505829C30C0f81F984a668";
  const DIST = "0x5e5b8F1e570C0db669EE83c6f91b9d144F42097A";
  const AMOUNT = 80_000_000n * 10n ** 18n;

  const cup = await ethers.getContractAt("IERC20", CUP);
  const bal = await cup.balanceOf(signer);
  console.log(`Signer:     ${signer}`);
  console.log(`Signer CUP: ${ethers.formatUnits(bal, 18)}`);
  if (bal < AMOUNT) throw new Error("not enough CUP");
  console.log(`Sending 80,000,000 CUP → ${DIST}`);
  const tx = await cup.transfer(DIST, AMOUNT);
  console.log(`tx:         ${tx.hash}`);
  const r = await tx.wait();
  console.log(`confirmed:  block ${r?.blockNumber}`);
  const db = await cup.balanceOf(DIST);
  console.log(`\nEA Bonus distributor CUP: ${ethers.formatUnits(db, 18)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
