# Deploying to Base mainnet

Pre-configured for the production treasury `0x5794F733eE53DfFdbd023ba91d357D8aA334E414`.
You just need a funded deployer key and a Basescan API key.

## 0) Prerequisites

- Node 20+
- A deployer wallet **holding ~0.005 ETH on Base mainnet** (covers gas for
  all three contract deploys + a buffer). Funding cost at current gas is
  a few dollars.
- A Basescan API key — https://basescan.org/myapikey (free, takes 30s).

## 1) Install + compile + test

```bash
cd contracts-base
npm install
npm test          # must print "23 passing" before you proceed
```

## 2) Fill in `.env`

```bash
cp .env.example .env
```

Open `.env` and set:

- `DEPLOYER_PRIVATE_KEY` — the 0x-prefixed private key of your deployer
  wallet. **Do not commit**, `.env` is already in `.gitignore`.
- `BASESCAN_API_KEY` — for automatic Basescan verification.

`TREASURY_ADDRESS` is already pre-filled with
`0x5794F733eE53DfFdbd023ba91d357D8aA334E414`. Leave `ADMIN_ADDRESS`
empty unless you want admin on a different key from the deployer.

## 3) Deploy

```bash
npm run deploy:base
```

Expected output (example):

```
=== Agents Cup — Base deployment ===
Network : base (chainId=8453)
Deployer: 0x...
Balance : 0.0049 ETH
Treasury: 0x5794F733eE53DfFdbd023ba91d357D8aA334E414
Admin   : 0x<deployer>
Fee bps : 250

Deploying AgentsCupPackStore...
  AgentsCupPackStore @ 0x...
Deploying AgentsCupMarketplace...
  AgentsCupMarketplace @ 0x...
Deploying AgentsCupMatchEscrow...
  AgentsCupMatchEscrow @ 0x...
    default entry fee: 0.001 ETH (adjustable via setEntryFee)

=== Summary ===
{ ...json... }

Addresses written to deployments/base.json

Verifying on Basescan...
Verification complete.
```

Addresses are saved to `contracts-base/deployments/base.json` — the
backend reads this during integration.

## 4) Sanity check

- Each address opens on https://basescan.org → contract tab should say
  "Contract Source Code Verified"
- `AgentsCupMatchEscrow.entryFee()` should return `1000000000000000` (1e15 wei = 0.001 ETH)
- `AgentsCupMarketplace.feeBps()` should return `250`
- `AgentsCupPackStore.treasury()` should return
  `0x5794F733eE53DfFdbd023ba91d357D8aA334E414`

## 5) What's next

Give me the output of `deployments/base.json` (or just paste the three
addresses). Next steps on my side:

- Backend: wire `viem` + `eth_getLogs` against the three contracts, swap
  the Solana payout code for ETH transfers from the treasury wallet.
- Frontend: swap `@solana/wallet-adapter-react` for `wagmi + viem`, add
  Base chain config, swap `sendCupPayment` for `writeContract` calls to
  the pack store / marketplace / escrow.
- DB: add `evm_address` column to users, run a migration window.
- Flip `NEXT_PUBLIC_MAINTENANCE_MODE` off after smoke test passes.

## Emergency

If anything looks off after deploy:

1. **Pause**: call `pause()` on PackStore / Marketplace / Escrow from
   the admin wallet. Stops further deposits without locking existing
   state.
2. **Rotate treasury**: `setTreasury(newAddress)` on PackStore and
   Marketplace.
3. **Redeploy**: contracts are cheap; redeploy if a constructor arg is
   wrong and update the backend `.env` to point at the new addresses.

The contracts are **not upgradeable** by design — so migration is done
by redeploy + switching the frontend env var, never by patching bytecode
in place. No rug-pull attack surface.
