# Agents Cup — Base mainnet cutover runbook

End-to-end instructions for flipping the production game from Solana
to Base. Assumes the three Base contracts are already deployed per
`contracts-base/DEPLOY_MAINNET.md` and you have their addresses in
hand.

The cutover is **frontend env + backend env + one-time Supabase
migration**. No redeploys of the smart contracts are required.

---

## 0) Prerequisites

Before flipping the switch:

- Deployed `AgentsCupPackStore`, `AgentsCupMarketplace`,
  `AgentsCupMatchEscrow` on Base (chainId 8453). See
  `contracts-base/DEPLOY_MAINNET.md`.
- Deployer/treasury wallet at `0x5794F733eE53DfFdbd023ba91d357D8aA334E414`
  with **at least 0.01 ETH on Base mainnet** so bot-match top-ups and
  payout gas don't stall the queue.
- Backend's `OPERATOR_ROLE` has been granted to the treasury key on
  all three contracts. (The deploy script does this automatically when
  `ADMIN_ADDRESS` is left empty — verify via Basescan's "Read
  Contract" tab: `hasRole(OPERATOR_ROLE, treasury)` must return
  `true` on each.)
- WalletConnect project ID minted at
  https://cloud.walletconnect.com — free, 2-min sign-up.
- Base RPC URL. Public `https://mainnet.base.org` works but
  rate-limits around 5 rps. For a launch with hundreds of concurrent
  users, grab an Alchemy / QuickNode key first.

---

## 1) Run the DB migration

Apply the two Supabase migrations added during this migration window:

```bash
cd backend/supabase
# Via the Supabase dashboard SQL editor, paste and run in order:
#   base_migration_v1.sql   (users.evm_address, listings.seller_evm_address,
#                            matches.home/away_evm_address)
#   base_migration_v2.sql   (listings.listing_id_hex UNIQUE, listings.price_wei,
#                            index on listing_id_hex)
```

These are idempotent — running twice is safe. Existing Solana rows
are untouched; legacy wallet addresses stay readable so historical
data survives.

---

## 2) Backend `.env`

Create / update `backend/.env` with:

```bash
# ─── Existing (keep as-is) ─────────────────────────────────
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
FRONTEND_URL=https://agents.cup,https://www.agents.cup   # comma-separated

# ─── Base chain config ─────────────────────────────────────
# Mainnet only — Sepolia support was pulled from the app build.
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/<YOUR_KEY>

# ─── Deployed contract addresses (from contracts-base/deployments/base.json) ─
PACK_STORE_ADDRESS=0x...
MARKETPLACE_ADDRESS=0x...
MATCH_ESCROW_ADDRESS=0x...

# ─── Treasury ───────────────────────────────────────────────
# Same 0x-prefixed private key used to deploy + grant OPERATOR_ROLE.
# Handles match payouts + bot-match top-ups.
TREASURY_PRIVATE_KEY=0x...

# Optional: override default entry fee (otherwise reads from chain)
# MATCH_ENTRY_FEE_WEI=1000000000000000     # 0.001 ETH
```

**Remove** (no longer used — every Solana helper was deleted):

- `SOLANA_RPC_URL`
- `SOLANA_CLUSTER`
- `TREASURY_WALLET` (pubkey form)
- `TOKEN_MINT`
- `PROGRAM_ID`

Verify by restarting the backend and watching the boot log:

```
Agents Cup Backend running on port 4000
Supabase: configured
Base RPC:  https://base-mainnet.g.alchemy.com/v2/...
Chain ID:  8453 (Base mainnet)
PackStore: 0x...
Marketpl.: 0x...
Escrow:    0x...
Treasury:  configured
```

Any `NOT SET` = stop and fix before proceeding.

---

## 3) Frontend `.env.local`

Create / update `frontend/.env.local`:

```bash
# ─── API pointer (existing) ─────────────────────────────────
NEXT_PUBLIC_API_URL=https://api.agents.cup/api   # or localhost:4000/api for dev

# ─── WalletConnect (required for RainbowKit) ─────────────────
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<from cloud.walletconnect.com>

# ─── Base chain ─────────────────────────────────────────────
# The frontend is locked to mainnet in `src/lib/wagmi.ts`; no
# sepolia RPC is needed on the client.
NEXT_PUBLIC_BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/<YOUR_KEY>

# ─── Deployed contracts (same as backend) ────────────────────
NEXT_PUBLIC_PACK_STORE_ADDRESS=0x...
NEXT_PUBLIC_MARKETPLACE_ADDRESS=0x...
NEXT_PUBLIC_MATCH_ESCROW_ADDRESS=0x...
```

Kill old Solana envs if present:
- `NEXT_PUBLIC_SOLANA_RPC_URL`
- `NEXT_PUBLIC_TOKEN_MINT`
- `NEXT_PUBLIC_PROGRAM_ID`

Then:

```bash
cd frontend
npm install
npm run build    # must succeed — the build ran green as of this cutover
```

---

## 4) Pack price sync

Pack prices live in **two** files that must match. Editing either
one alone desyncs on-chain verification from the buy button.

- `backend/src/services/packService.ts` → `PACK_CONFIGS`
- `frontend/src/data/agents.ts` → `PACK_TYPES`

Both use `tier` + `priceWei`. The backend verifier compares the wei
amount bit-for-bit; if you bump a price, update both files, redeploy
both services, and don't let old browser tabs buy at the old price
(they'll hit `TX verification failed`).

---

## 5) Smoke test (mainnet)

The site is locked to Base mainnet (8453). If you want to dry-run
contract changes against Base Sepolia first, do it from the
`contracts-base/` Hardhat workspace (`npm run deploy:sepolia`) —
the site itself can't connect to Sepolia anymore so there's no
safety net against a bad config there.

1. **Connect wallet** — click Connect in the navbar, pick MetaMask,
   confirm Base network. Address must display in the navbar.
2. **Open a Starter pack** (cheapest; 0.0015 ETH).
   - MetaMask shows `buyPack` call to `PackStore`
   - After confirmation the card reveal animation runs
   - Collection page shows the new cards
3. **List one of those cards** for 0.005 ETH on the marketplace.
   - MetaMask prompts for `listAgent` tx
   - Refresh Browse tab; listing appears with "YOUR LISTING" chip
4. **Switch to a second wallet, buy that listing.**
   - MetaMask prompts for `buyAgent` with msg.value = 0.005 ETH
   - Card transfers to buyer's collection
   - Seller's wallet receives ~0.00488 ETH (0.005 – 2.5% fee)
   - Treasury wallet receives ~0.000125 ETH (the 2.5% cut)
5. **Build an 11-player squad + click Find Match.**
   - MetaMask prompts for `depositEntry` tx with msg.value = 0.001 ETH
   - After 20 s without an opponent, bot match auto-starts
   - Match plays out ~60s
   - On a win, wallet receives 0.002 ETH (0.001 refund + 0.001
     treasury top-up). On a loss, nothing. On a draw, 0.001 ETH
     refund.
6. **Cancel queue mid-wait.** Should refund 0.001 ETH.
7. **Open Basescan, spot-check**:
   - `PackStore.PackPurchased` event fired with expected amount
   - `Marketplace.AgentSold` event fired
   - `MatchEscrow.EntryDeposited` + `Forfeited` events fired
   - Treasury ETH balance matches sum of fees received – payouts sent

At 0.0015 ETH/pack the real-money smoke costs under $10 to run.

---

## 6) Flip the maintenance toggle

Once smoke test passes on mainnet:

```bash
# frontend/.env.local
NEXT_PUBLIC_MAINTENANCE_MODE=false
```

Redeploy the frontend. The `/early-access` routes stay live
regardless via the bypass list in `layout.tsx`, so you can keep them
running during the flip.

---

## 7) Emergency levers

If something looks wrong in the first hour of public traffic:

| Problem | Lever |
|---|---|
| Unexpected pack behavior | Flip `NEXT_PUBLIC_MAINTENANCE_MODE=true`, redeploy frontend (30s) — backend still accepts in-flight tx claims |
| Contract exploit suspected | Call `pause()` on PackStore/Marketplace/Escrow from admin wallet. Blocks new deposits immediately. Existing escrow funds stay forfeit-able |
| Treasury running out of ETH | Refill the treasury wallet — bot-match payouts stall silently until balance is positive. Add 0.05–0.1 ETH buffer for busy hours |
| Stuck escrow slot | Call `forfeitAll(matchId, <user_address>)` from admin. Any operator key works |
| Need to roll prices back | Edit `PACK_CONFIGS` + `PACK_TYPES` (both!), redeploy both services. On-chain contract stays |

Contracts are **not upgradeable by design**. Any fix = redeploy +
swap `NEXT_PUBLIC_*_ADDRESS` env vars and restart. There is no
`migrate()` function, which removes that attack surface but means
you need the deploy script handy.

---

## 8) What stayed the same

Not everything changed. Worth knowing what you **do not** need to
touch:

- Supabase schema (only additive — legacy rows untouched)
- The early-access flow (independent of the game's chain)
- Squad/leaderboard/match-engine logic — all unchanged
- The `$CUP` memecoin on Solana — remains a separate promotional
  token. The CupToken widget on the homepage still points at
  pump.fun; only the label was updated from "GAME TOKEN" to
  "COMMUNITY TOKEN" since it's no longer used in-game.

---

## 9) Known warnings (not blockers)

During `next build` you may see:

```
ReferenceError: indexedDB is not defined
```

This is wagmi/RainbowKit's session-storage fallback trying to read
during static page collection. All game pages are marked `ƒ
(Dynamic)` so they render server-side per request and never touch
this code path in production. The warning is cosmetic — build still
completes successfully.

---

## 10) Rollback plan

If the Base migration goes south and you need to go back to Solana:

1. Flip `NEXT_PUBLIC_MAINTENANCE_MODE=true`
2. `git revert` the migration PR (single commit containing all file
   changes in this doc)
3. Restore the previous `frontend/.env.local` and `backend/.env` from
   the secret store
4. Redeploy both services

The Supabase additive migrations (`base_migration_v1.sql`,
`base_migration_v2.sql`) can stay — the extra columns are harmless
on Solana and mean you don't need to do a second forward-migration
if you try Base again later.
