import { ethers } from "hardhat";

async function main() {
  const NFT = "0x9FA62fCd896A72b5C6F0474Aa1a34234326Ee451";
  // Use {id} template per ERC-1155; marketplaces replace it with padded hex tokenId.
  // We host both "1.json" and the 0x00..01 padded version as fallbacks.
  const NEW_URI = "https://play.agentscup.com/nft/top-holder/{id}.json";

  const abi = [
    "function setURI(string newuri) external",
    "function uri(uint256 id) view returns (string)",
  ];
  const nft = await ethers.getContractAt(abi, NFT);
  const before = await nft.uri(1);
  console.log(`Before: ${before}`);
  const tx = await nft.setURI(NEW_URI);
  console.log(`tx:     ${tx.hash}`);
  await tx.wait();
  const after = await nft.uri(1);
  console.log(`After:  ${after}`);
  console.log(`\nDone. OpenSea will pick up new metadata within ~1 hour.`);
  console.log(`Refresh metadata URL: https://opensea.io/assets/base/${NFT}/1`);
}

main().catch((e) => { console.error(e); process.exit(1); });
