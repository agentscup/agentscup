import { ethers } from "hardhat";
import * as fs from "fs";

/**
 * Transfer 123 "Agents Cup" ERC-721 NFTs from the deployer wallet to
 * the top 123 CUP holders (cup-top200-eoa-only.csv).
 *
 * Uses sequential safeTransferFrom — 123 txs, ~3-5 min on Base.
 * Waits for each receipt so nonces don't race.
 */

const NFT_CONTRACT = "0x544274a75A0bbf0Ca983d58cE2358AFe76D8C53A"; // Agents Cup ERC-721
const RECIPIENTS_CSV =
  "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/cup-top200-eoa-only.csv";

async function paginateOwnedTokenIds(ownerAddr: string): Promise<number[]> {
  const out: number[] = [];
  let url = `https://base.blockscout.com/api/v2/addresses/${ownerAddr}/nft`;
  for (let p = 0; p < 20; p++) {
    const r = await fetch(url);
    const d = await r.json() as any;
    for (const it of d.items || []) {
      if ((it.token?.address_hash ?? "").toLowerCase() === NFT_CONTRACT.toLowerCase()) {
        out.push(Number(it.id));
      }
    }
    if (!d.next_page_params) break;
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(d.next_page_params))
      usp.set(k, String(v as any));
    url = `https://base.blockscout.com/api/v2/addresses/${ownerAddr}/nft?${usp.toString()}`;
  }
  out.sort((a, b) => a - b);
  return out;
}

async function main() {
  const [signer] = await ethers.getSigners();
  const from = await signer.getAddress();

  // 1. Load recipients
  const lines = fs.readFileSync(RECIPIENTS_CSV, "utf8").trim().split("\n");
  const recipients = lines
    .slice(1)
    .map((l) => l.split(",")[1])
    .filter((a) => /^0x[a-fA-F0-9]{40}$/.test(a))
    .slice(0, 123);
  console.log(`Recipients: ${recipients.length}`);

  // 2. Load owned token IDs
  console.log(`Fetching owned NFTs from ${NFT_CONTRACT}...`);
  const owned = await paginateOwnedTokenIds(from);
  console.log(`Owned: ${owned.length} tokens (range ${owned[0]}..${owned[owned.length - 1]})`);
  if (owned.length < recipients.length) {
    throw new Error(`Need ${recipients.length}, only own ${owned.length}`);
  }
  const picks = owned.slice(0, recipients.length);
  console.log(`Will send token ids: ${picks[0]}..${picks[picks.length - 1]}`);

  // 3. Get contract
  const abi = [
    "function safeTransferFrom(address from, address to, uint256 tokenId) external",
    "function ownerOf(uint256 tokenId) view returns (address)",
  ];
  const nft = await ethers.getContractAt(abi, NFT_CONTRACT);

  // 4. Transfer loop — sequential with receipt waits
  console.log(`\nSending ${recipients.length} transfers (sequential)...`);
  const started = Date.now();
  let ok = 0, fail = 0;
  const log: { i: number; to: string; id: number; tx?: string; err?: string }[] = [];
  for (let i = 0; i < recipients.length; i++) {
    const to = recipients[i];
    const id = picks[i];
    try {
      const tx = await nft["safeTransferFrom(address,address,uint256)"](from, to, id);
      await tx.wait();
      ok++;
      log.push({ i, to, id, tx: tx.hash });
      if ((i + 1) % 10 === 0 || i === recipients.length - 1) {
        const elapsed = Math.round((Date.now() - started) / 1000);
        console.log(`  ${i + 1}/${recipients.length} done (${elapsed}s, ${fail} failed)`);
      }
    } catch (e) {
      fail++;
      const msg = e instanceof Error ? e.message : String(e);
      log.push({ i, to, id, err: msg.slice(0, 120) });
      console.warn(`  [fail] #${i} → ${to} id=${id}: ${msg.slice(0, 120)}`);
    }
  }

  // 5. Save log
  const outFile =
    "C:/Users/doguk/OneDrive/Desktop/agentscup-airdrop/nft-airdrop-log.json";
  fs.writeFileSync(outFile, JSON.stringify(log, null, 2));

  console.log(`\n═══ DONE ═══`);
  console.log(`Success: ${ok}`);
  console.log(`Failed:  ${fail}`);
  console.log(`Log:     ${outFile}`);
  console.log(`Time:    ${Math.round((Date.now() - started) / 1000)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
