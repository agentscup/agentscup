/**
 * Central ABI barrel for downstream apps.
 *
 * Hardhat writes full artifacts (abi + bytecode + metadata) to
 * `contracts-base/artifacts/contracts/*.sol/*.json`. The extraction
 * step copies just the `abi` arrays into `contracts-base/abi/*.json`
 * so backend and frontend can import them without pulling in the
 * Hardhat toolchain.
 *
 * Re-run via `npm run abi:extract` in the contracts-base workspace
 * after any Solidity change to keep consumers in sync.
 */

import PackStoreArtifact from "./AgentsCupPackStore.json";
import MarketplaceArtifact from "./AgentsCupMarketplace.json";
import MatchEscrowArtifact from "./AgentsCupMatchEscrow.json";

export const AgentsCupPackStoreAbi = PackStoreArtifact;
export const AgentsCupMarketplaceAbi = MarketplaceArtifact;
export const AgentsCupMatchEscrowAbi = MatchEscrowArtifact;

export const BASE_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
