import { ethers } from "hardhat";
import * as fs from "fs";

const NFT_CONTRACT = "0x544274a75A0bbf0Ca983d58cE2358AFe76D8C53A";

async function main() {
  const [signer] = await ethers.getSigners();
  const from = await signer.getAddress();

  const abi = [
    "function safeTransferFrom(address from, address to, uint256 tokenId) external",
    "function ownerOf(uint256) view returns (address)",
  ];
  const nft = new ethers.Contract(NFT_CONTRACT, abi, signer);

  const missing = fs.readFileSync(
    "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/nft-airdrop-missing.csv", "utf8"
  ).trim().split("\n").slice(1).filter((l) => /^0x[a-f0-9]{40}$/i.test(l));
  console.log(`Missing: ${missing.length}`);

  // Fresh owned pool
  let url = `https://base.blockscout.com/api/v2/addresses/${from}/nft`;
  const pool: number[] = [];
  for (let p = 0; p < 20; p++) {
    const r = await fetch(url);
    const d: any = await r.json();
    for (const it of d.items || []) {
      if ((it.token?.address_hash ?? "").toLowerCase() === NFT_CONTRACT.toLowerCase()) {
        pool.push(Number(it.id));
      }
    }
    if (!d.next_page_params) break;
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(d.next_page_params)) usp.set(k, String(v as any));
    url = `https://base.blockscout.com/api/v2/addresses/${from}/nft?${usp.toString()}`;
  }
  pool.sort((a, b) => a - b);
  console.log(`Pool: ${pool.length}`);

  const ok: any[] = [];
  const fail: any[] = [];
  let nonce = await ethers.provider.getTransactionCount(from, "latest");
  let poolIdx = 0;

  for (let i = 0; i < missing.length; i++) {
    const to = missing[i];
    let id = -1;
    while (poolIdx < pool.length) {
      const cand = pool[poolIdx++];
      try {
        const owner = ((await nft.ownerOf(cand)) as string).toLowerCase();
        if (owner === from.toLowerCase()) { id = cand; break; }
      } catch {}
    }
    if (id === -1) break;
    try {
      const tx = await nft.safeTransferFrom(from, to, id, { nonce });
      const r = await tx.wait(1);
      if (r?.status === 1) { ok.push({ to, id, tx: tx.hash }); nonce++; }
      else fail.push({ to, id, err: "status 0" });
    } catch (e) {
      fail.push({ to, id, err: String(e).slice(0, 120) });
      nonce = await ethers.provider.getTransactionCount(from, "latest");
    }
    console.log(`  ${i + 1}/${missing.length} ${to.slice(0, 10)} id=${id} — ${ok.length}ok ${fail.length}fail`);
    await new Promise((r) => setTimeout(r, 300));
  }

  fs.writeFileSync(
    "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/nft-airdrop-log-final3.json",
    JSON.stringify({ ok, fail }, null, 2)
  );
  console.log(`\n${ok.length} success, ${fail.length} fail`);
}

main().catch((e) => { console.error(e); process.exit(1); });
