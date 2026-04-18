# Agents Cup — Base contracts

EVM contracts for Agents Cup on [Base](https://base.org). Solidity 0.8.26,
Hardhat 2.22, OpenZeppelin 5. Replaces the Solana + $CUP-token economy
with native ETH payments on Base.

## Contracts

| Name                    | Purpose                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `AgentsCupPackStore`    | Accepts ETH for pack purchases, forwards to treasury, emits `PackPurchased`.                |
| `AgentsCupMarketplace`  | Lists/buys/cancels agents in native ETH. Splits payment to seller + treasury fee (bps).     |
| `AgentsCupMatchEscrow`  | Holds 0.001 ETH per-player match entry, pays winner / refunds on draw. Admin-tunable fee.   |

Agents themselves remain off-chain Supabase rows (same as the Solana
flow today). These contracts are the **payment + event rail** the
backend listens to for crediting/transferring agents.

## Design notes

- **No $CUP token.** Every purchase is in native ETH. No ERC-20 approvals,
  no bridge, no migration — the wallet just signs one tx.
- **Packs forward immediately.** `PackStore` never holds a balance; ETH
  goes straight to the treasury in the same tx to reduce attack surface.
- **Marketplace escrow-less.** Seller sets a price, buyer sends exactly
  that amount, contract splits and forwards in one tx. No custody window.
- **Backend-authoritative.** The backend still owns pack-contents and
  agent-ownership logic in the DB. Contracts provide the payment proof
  (events) that the backend uses to credit buyers idempotently via a
  client-chosen `requestId` / `listingId`.
- **Roles.**
  - `DEFAULT_ADMIN_ROLE` can rotate treasury, adjust fees, pause.
  - `PAUSER_ROLE` (PackStore) can pause purchases during incidents.
  - Both are granted to the `admin` address at deploy; can be
    transferred / rotated later.

## Layout

```
contracts-base/
├── contracts/
│   ├── AgentsCupPackStore.sol
│   ├── AgentsCupMarketplace.sol
│   └── AgentsCupMatchEscrow.sol
├── scripts/
│   └── deploy.ts
├── test/
│   ├── PackStore.test.ts
│   ├── Marketplace.test.ts
│   └── MatchEscrow.test.ts
├── hardhat.config.ts
├── tsconfig.json
├── package.json
└── .env.example
```

## Getting started

```bash
cd contracts-base
npm install
cp .env.example .env
# fill in DEPLOYER_PRIVATE_KEY + BASESCAN_API_KEY

npm run build          # compile
npm test               # run the 13 unit tests

# Local dev (separate terminal)
npm run node           # starts a local hardhat node
npm run deploy:local

# Testnet
npm run deploy:sepolia

# Mainnet (double-check .env, use a hardware wallet for DEPLOYER_PRIVATE_KEY)
npm run deploy:base
```

## Migration plan (Solana → Base)

Status after this session: **contracts drafted + unit-tested**, not yet
deployed. Frontend + backend integration still pending.

### Phase 1 — contracts ✅

- [x] Scaffold Hardhat workspace
- [x] `AgentsCupPackStore` (ETH payable)
- [x] `AgentsCupMarketplace` (ETH payable, bps fee)
- [x] `AgentsCupMatchEscrow` (0.001 ETH entry, winner-takes-all, draw refunds)
- [x] Deployment script for local / Base Sepolia / Base mainnet
- [x] Unit tests pass across all three contracts

### Phase 2 — integration (next)

- [ ] Deploy to Base Sepolia; smoke test from a script
- [ ] Backend: swap `solana.ts` verification for a `base.ts` module using
      `viem` + `eth_getLogs` to read `PackPurchased` / `AgentSold`
      events.
- [ ] Backend: swap `sendPayout` (Solana CUP transfer) for native-ETH
      transfer via `viem` wallet client. (Match payouts currently use
      CUP — see "Open questions".)
- [ ] Frontend: replace `@solana/wallet-adapter-react` with
      `wagmi` + `viem` + Base connectors (MetaMask, Coinbase Wallet,
      WalletConnect). New `useCupBalance` → `useEthBalance`.
- [ ] Frontend: swap `sendCupPayment` helper for a wagmi
      `writeContract({ abi: packStoreAbi, functionName: 'buyPack', ...})`.
- [ ] DB: widen `wallet_address` (currently Solana base58, need 0x… hex
      too). Safest path — a new column `evm_address` + migration window
      where both are honored.
- [ ] Disable pack/marketplace routes on Solana RPC; point frontend at
      Base RPC.

### Phase 3 — cutover

- [ ] Maintenance mode ON (already live via `NEXT_PUBLIC_MAINTENANCE_MODE`)
- [ ] Deploy contracts to Base mainnet, verify on Basescan
- [ ] Backend: rotate `TREASURY_PRIVATE_KEY` / address to an EVM keypair
- [ ] Frontend env: `NEXT_PUBLIC_PACK_STORE_ADDRESS`,
      `NEXT_PUBLIC_MARKETPLACE_ADDRESS`, `NEXT_PUBLIC_CHAIN_ID=8453`
- [ ] Smoke test end-to-end on mainnet (cheap pack tier)
- [ ] Maintenance mode OFF

## Open questions

1. **Pack prices in ETH.** What's the price ladder? Previously 10k /
   50k / 150k $CUP. Lives entirely in the backend so no redeploy needed
   — we just need a product call on the numbers.

2. **Marketplace fee bps.** Default set to 250 (2.5%). Change via
   `setFeeBps` any time; capped at 5%.

3. **Match entry fee.** Set to 0.001 ETH on deploy; admin can tune via
   `setEntryFee` without redeploying.
