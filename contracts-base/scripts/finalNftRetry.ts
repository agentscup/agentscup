import { ethers } from "hardhat";
import * as fs from "fs";

/** Final retry for the NFT airdrop — explicit nonce management,
 *  per-tx confirmation wait. Picks from currently-owned token IDs
 *  each iteration. */

const NFT_CONTRACT = "0x544274a75A0bbf0Ca983d58cE2358AFe76D8C53A";

async function currentlyOwnedTokens(owner: string): Promise<number[]> {
  const out: number[] = [];
  let url = `https://base.blockscout.com/api/v2/addresses/${owner}/nft`;
  for (let p = 0; p < 20; p++) {
    const r = await fetch(url);
    const d: any = await r.json();
    for (const it of d.items || []) {
      if ((it.token?.address_hash ?? "").toLowerCase() === NFT_CONTRACT.toLowerCase()) {
        out.push(Number(it.id));
      }
    }
    if (!d.next_page_params) break;
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(d.next_page_params)) usp.set(k, String(v as any));
    url = `https://base.blockscout.com/api/v2/addresses/${owner}/nft?${usp.toString()}`;
  }
  return out.sort((a, b) => a - b);
}

async function main() {
  const [signer] = await ethers.getSigners();
  const from = await signer.getAddress();
  const provider = ethers.provider;

  const retryLog = JSON.parse(
    fs.readFileSync(
      "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/nft-airdrop-log-retry.json",
      "utf8"
    )
  );
  const stillFailed = retryLog.fail.filter((f: any) => f.err && f.err !== "ownership_changed");
  console.log(`Still-failed recipients: ${stillFailed.length}`);

  const pool = await currentlyOwnedTokens(from);
  console.log(`Currently owned: ${pool.length}`);

  const nftAbi = [
    "function safeTransferFrom(address from, address to, uint256 tokenId) external",
    "function ownerOf(uint256) view returns (address)",
  ];
  const nft = new ethers.Contract(NFT_CONTRACT, nftAbi, signer);

  let nonce = await provider.getTransactionCount(from, "pending");
  console.log(`Starting nonce: ${nonce}`);

  const ok: any[] = [];
  const fail: any[] = [];
  const picks = pool.slice(0, stillFailed.length);

  for (let i = 0; i < stillFailed.length; i++) {
    const to = stillFailed[i].to;
    const id = picks[i];
    if (id === undefined) { console.warn("no more tokens"); break; }
    try {
      // Explicit nonce + gas
      const tx = await nft.safeTransferFrom(from, to, id, { nonce });
      await tx.wait();
      ok.push({ to, id, tx: tx.hash });
      nonce++;
      if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${stillFailed.length}: ok=${ok.length} fail=${fail.length}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      fail.push({ to, id, err: msg.slice(0, 150) });
      // Refresh nonce on failure in case something got out of sync
      nonce = await provider.getTransactionCount(from, "pending");
    }
  }

  fs.writeFileSync(
    "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/nft-airdrop-log-final.json",
    JSON.stringify({ ok, fail }, null, 2)
  );
  console.log(`\nFinal: ${ok.length} success, ${fail.length} fail`);
}

main().catch((e) => { console.error(e); process.exit(1); });
