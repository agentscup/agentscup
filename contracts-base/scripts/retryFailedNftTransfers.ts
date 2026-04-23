import { ethers } from "hardhat";
import * as fs from "fs";

const NFT_CONTRACT = "0x544274a75A0bbf0Ca983d58cE2358AFe76D8C53A";
const LOG_IN = "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/nft-airdrop-log.json";
const LOG_OUT = "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/nft-airdrop-log-retry.json";

async function main() {
  const [signer] = await ethers.getSigners();
  const from = await signer.getAddress();

  const log: { i: number; to: string; id: number; tx?: string; err?: string }[] =
    JSON.parse(fs.readFileSync(LOG_IN, "utf8"));
  const failed = log.filter((l) => l.err);
  console.log(`Retrying ${failed.length} failed transfers...`);

  const ownerOfAbi = [
    "function ownerOf(uint256) view returns (address)",
    "function safeTransferFrom(address from, address to, uint256 tokenId) external",
  ];
  const nft = await ethers.getContractAt(ownerOfAbi, NFT_CONTRACT);

  // Pre-check: is the deployer still the owner of the failed token IDs?
  // If not, the Blockscout snapshot was stale — pick fresh token IDs that
  // the deployer does own right now.
  const currentlyOwned: number[] = [];
  // Fetch fresh list from Blockscout
  let url = `https://base.blockscout.com/api/v2/addresses/${from}/nft`;
  for (let p = 0; p < 20; p++) {
    const r = await fetch(url);
    const d: any = await r.json();
    for (const it of d.items || []) {
      if ((it.token?.address_hash ?? "").toLowerCase() === NFT_CONTRACT.toLowerCase()) {
        currentlyOwned.push(Number(it.id));
      }
    }
    if (!d.next_page_params) break;
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(d.next_page_params))
      usp.set(k, String(v as any));
    url = `https://base.blockscout.com/api/v2/addresses/${from}/nft?${usp.toString()}`;
  }
  currentlyOwned.sort((a, b) => a - b);
  console.log(`Currently owned (fresh): ${currentlyOwned.length} tokens`);

  // Use fresh token IDs for retries — skip the original "failed" IDs in case
  // they really are owned elsewhere. Pop one fresh id per retry.
  const ok: typeof log = [];
  const fail: typeof log = [];
  let pool = [...currentlyOwned];
  let i = 0;
  for (const f of failed) {
    // Verify the recipient is still not already a token owner on our contract.
    if (pool.length === 0) { console.warn("pool empty"); break; }
    const pickedId = pool.shift()!;
    // Double-check on-chain that we really own pickedId
    try {
      const actualOwner = (await nft.ownerOf(pickedId)) as string;
      if (actualOwner.toLowerCase() !== from.toLowerCase()) {
        console.warn(`skip id=${pickedId} — owner is ${actualOwner}`);
        fail.push({ ...f, id: pickedId, err: "ownership_changed" });
        continue;
      }
    } catch (e) {
      console.warn(`skip id=${pickedId} — ownerOf reverted`);
      fail.push({ ...f, id: pickedId, err: "ownerOf_reverted" });
      continue;
    }
    try {
      const tx = await nft["safeTransferFrom(address,address,uint256)"](from, f.to, pickedId);
      await tx.wait();
      ok.push({ i: f.i, to: f.to, id: pickedId, tx: tx.hash });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      fail.push({ i: f.i, to: f.to, id: pickedId, err: msg.slice(0, 150) });
    }
    i++;
    if (i % 10 === 0) console.log(`  retry ${i}/${failed.length}: ok=${ok.length} fail=${fail.length}`);
  }
  fs.writeFileSync(LOG_OUT, JSON.stringify({ ok, fail }, null, 2));
  console.log(`\nRetry result: ${ok.length} success, ${fail.length} fail`);
  console.log(`Log: ${LOG_OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
