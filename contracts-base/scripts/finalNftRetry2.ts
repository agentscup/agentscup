import { ethers } from "hardhat";
import * as fs from "fs";

const NFT_CONTRACT = "0x544274a75A0bbf0Ca983d58cE2358AFe76D8C53A";

async function main() {
  const [signer] = await ethers.getSigners();
  const from = await signer.getAddress();
  const provider = ethers.provider;

  // Collect recipients still missing from the 3 prior rounds
  const r1 = JSON.parse(fs.readFileSync(
    "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/nft-airdrop-log.json", "utf8"
  ));
  const r2 = JSON.parse(fs.readFileSync(
    "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/nft-airdrop-log-retry.json", "utf8"
  ));
  const r3 = JSON.parse(fs.readFileSync(
    "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/nft-airdrop-log-final.json", "utf8"
  ));
  const delivered = new Set<string>();
  for (const l of r1.filter((x: any) => x.tx)) delivered.add(l.to.toLowerCase());
  for (const l of r2.ok) delivered.add(l.to.toLowerCase());
  for (const l of r3.ok) delivered.add(l.to.toLowerCase());

  // Original full recipient list
  const csvLines = fs.readFileSync(
    "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/cup-top200-eoa-only.csv", "utf8"
  ).trim().split("\n");
  const allRecipients = csvLines.slice(1).map((l) => l.split(",")[1].toLowerCase())
    .filter((a) => /^0x[a-f0-9]{40}$/.test(a));
  const todo = allRecipients.filter((a) => !delivered.has(a));
  console.log(`Still missing: ${todo.length} recipients`);

  // Get current owned token IDs via Blockscout, but verify each with direct RPC before use
  let url = `https://base.blockscout.com/api/v2/addresses/${from}/nft`;
  const candidates: number[] = [];
  for (let p = 0; p < 20; p++) {
    const r = await fetch(url);
    const d: any = await r.json();
    for (const it of d.items || []) {
      if ((it.token?.address_hash ?? "").toLowerCase() === NFT_CONTRACT.toLowerCase()) {
        candidates.push(Number(it.id));
      }
    }
    if (!d.next_page_params) break;
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(d.next_page_params)) usp.set(k, String(v as any));
    url = `https://base.blockscout.com/api/v2/addresses/${from}/nft?${usp.toString()}`;
  }
  candidates.sort((a, b) => a - b);
  console.log(`Candidate tokens (Blockscout): ${candidates.length}`);

  const nftAbi = [
    "function safeTransferFrom(address from, address to, uint256 tokenId) external",
    "function ownerOf(uint256) view returns (address)",
  ];
  const nft = new ethers.Contract(NFT_CONTRACT, nftAbi, signer);

  let nonce = await provider.getTransactionCount(from, "latest");
  console.log(`Starting nonce: ${nonce}`);

  const ok: { to: string; id: number; tx: string }[] = [];
  const fail: { to: string; id: number; err: string }[] = [];
  let poolIdx = 0;

  for (let i = 0; i < todo.length && poolIdx < candidates.length; i++) {
    const to = todo[i];
    let id = -1;

    // Find a token we VERIFIABLY own right now
    while (poolIdx < candidates.length) {
      const candidate = candidates[poolIdx++];
      try {
        const actualOwner = ((await nft.ownerOf(candidate)) as string).toLowerCase();
        if (actualOwner === from.toLowerCase()) { id = candidate; break; }
      } catch {}
    }
    if (id === -1) { console.warn("no more owned tokens"); break; }

    try {
      const tx = await nft.safeTransferFrom(from, to, id, { nonce });
      const receipt = await tx.wait(1); // 1 confirmation
      if (receipt?.status === 1) {
        ok.push({ to, id, tx: tx.hash });
        nonce++;
      } else {
        fail.push({ to, id, err: "receipt status 0" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      fail.push({ to, id, err: msg.slice(0, 150) });
      nonce = await provider.getTransactionCount(from, "latest"); // resync
    }

    if ((i + 1) % 5 === 0) console.log(`  ${i + 1}/${todo.length}: ok=${ok.length} fail=${fail.length}`);
    await new Promise((r) => setTimeout(r, 500)); // small pause per tx
  }

  fs.writeFileSync(
    "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/nft-airdrop-log-final2.json",
    JSON.stringify({ ok, fail }, null, 2)
  );
  console.log(`\nFinal2: ${ok.length} success, ${fail.length} fail`);
}

main().catch((e) => { console.error(e); process.exit(1); });
