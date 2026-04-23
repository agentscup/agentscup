import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const BASE_SEPOLIA_RPC_URL =
  process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      chainId: 84532,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    base: {
      url: BASE_RPC_URL,
      chainId: 8453,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  sourcify: {
    enabled: true,
  },
  // Etherscan V2 multi-chain: one API key covers all chains (Base,
  // Base Sepolia, mainnet, etc). Passing the key as a plain string
  // — instead of the old per-network `apiKey: { base: ..., baseSepolia: ... }`
  // shape — is what tells hardhat-verify to use the unified v2 endpoint
  // and send `chainid=8453` in each request. The old per-network config
  // silently omits the chainid param and every verify returns
  // "Missing chainid parameter (required for v2 api)".
  etherscan: {
    apiKey: BASESCAN_API_KEY,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
