# Agents Cup — Launch Runbook

Everything you need to flip the game from maintenance into live play
for thousands of concurrent users. Intended to be executed in order,
top-to-bottom, on launch day.

---

## Architecture snapshot

**Production stack as of this runbook:**

| Component | Location | What it does |
|---|---|---|
| `contracts-base/` contracts | Base mainnet (chainId 8453) | PackStore / Marketplace / MatchEscrow — deployed, admin = `0x5A31…6568` |
| `frontend/` | Vercel (`agentscup.com`) | Next 16 app, RainbowKit + wagmi |
| `backend/` | Railway | Express + socket.io, holds operator private key |
| Supabase | Cloud | Postgres — users, agents, matches, listings, leaderboard, early-access claims |

**Wallets:**

| Role | Address | Private key location |
|---|---|---|
| Revenue recipient (pack + marketplace fees) | `0x1d4333f725ee240aea939cbAD3216332FB8495EB` | User-held — no server access |
| Operator (deploy + admin + match payouts) | `0x5A31f465064Cb00a99F0885c480927B5ea906568` | `backend/.env` `TREASURY_PRIVATE_KEY` |

**Contract addresses (Base mainnet):**
```
PackStore:   0xD35F2536043786e27453A2A58e084905bd6D0ce2
Marketplace: 0x9983D5c374A656De96804a4195983Fd3021Ea705
MatchEscrow: 0x98dD410D8D5EcAdf425B118e6BAc1762FE47A20C
```

---

## 1. Pre-launch — 24 hours before

### 1.1 RPC provider

Public `mainnet.base.org` rate-limits at ~5 rps and **will melt** under
a crowd. Before flipping maintenance off, sign up for a paid RPC and
set the env:

```bash
# Recommended: Alchemy (300 CU/s free, generous for Base)
#   https://dashboard.alchemy.com/  → Create App → Base mainnet
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/<your-key>

# Optional fallback — viem's fallback transport tries primary first,
# falls back to this on timeout/rate-limit. Public RPC as a last resort.
BASE_RPC_URL_FALLBACK=https://mainnet.base.org
```

Set this on **both** Railway (backend) and Vercel (frontend env
`NEXT_PUBLIC_BASE_RPC_URL`). Redeploy each to pick up the change.

### 1.2 Treasury / operator funding

Operator wallet (`0x5A31…6568`) pays match-win top-ups and gas.

**Formula:** expected bot-win rate × prize top-up (0.001 ETH) ×
safety factor. For 1000 concurrent players at launch peak,
conservatively **fund `0x5A31…` with 0.1–0.5 ETH**. The backend
startup log screams `⚠ TREASURY LOW` when it drops below 0.01 ETH
(10 × entry fee) — refill before that.

Monitor live:
```bash
curl https://backend-production-8419.up.railway.app/health/treasury
# → { address, balanceEth, low: false, thresholdEth: "0.01" }
```

Put this on a 1-minute uptime check (UptimeRobot, BetterStack) with
alert on `low: true`.

### 1.3 Contract owner sanity

Once, from your admin machine:

```bash
cd contracts-base
# Verify admin is you and operator role is granted
npx hardhat console --network base
# in the REPL:
# const c = await ethers.getContractAt("AgentsCupMatchEscrow", "0x98dD…20C")
# await c.hasRole(await c.DEFAULT_ADMIN_ROLE(), "0x5A31…6568")   → true
# await c.hasRole(await c.OPERATOR_ROLE(),      "0x5A31…6568")   → true
# await c.entryFee()                                               → 1000000000000000n
```

If any role check returns `false`, grant it **before launch** or
match settlements will fail permanently.

### 1.4 Revenue address check

Before launch, re-verify both contracts route revenue to the new
wallet:

```bash
curl http://localhost:4000 -s || true   # local server must be up
cd frontend && node -e "
const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');
const pack = require('./src/abi/AgentsCupPackStore.json');
const mkt  = require('./src/abi/AgentsCupMarketplace.json');
(async () => {
  const c = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
  const p = await c.readContract({ address: '0xD35F2536043786e27453A2A58e084905bd6D0ce2', abi: pack, functionName: 'treasury' });
  const m = await c.readContract({ address: '0x9983D5c374A656De96804a4195983Fd3021Ea705', abi: mkt,  functionName: 'treasury' });
  console.log('PackStore:',   p);
  console.log('Marketplace:', m);
})();
"
# Both must print 0x1d4333f725ee240aea939cbAD3216332FB8495EB
```

---

## 2. Launch day — flip the switch

### 2.1 Latest code to production

```bash
# Frontend
cd frontend
vercel --prod --yes
# Capture the URL, then:
vercel alias set frontend-<hash>-agntteam.vercel.app agentscup.com --scope agntteam
vercel alias set frontend-<hash>-agntteam.vercel.app www.agentscup.com --scope agntteam

# Backend — depends on your Railway setup; usually:
#   git push railway main
# or the dashboard "Redeploy latest" button. Then watch logs.
```

### 2.2 Open the game

Vercel prod env → flip **`NEXT_PUBLIC_MAINTENANCE_MODE` to `false`**:
- `vercel env rm NEXT_PUBLIC_MAINTENANCE_MODE production --scope agntteam --yes`
- `printf "false" | vercel env add NEXT_PUBLIC_MAINTENANCE_MODE production --scope agntteam`
- Redeploy: `vercel --prod --yes` + alias flips

At this point:
- `agentscup.com/` → now serves the home page (no more `/early-access` redirect — middleware gates on maintenance mode)
- `/packs`, `/collection`, `/marketplace`, `/match`, `/squad`, `/leaderboard` → all live
- `/early-access` stays reachable for anyone still mid-flow

### 2.3 First-five-minutes checklist

- [ ] `agentscup.com/` loads the game home (not maintenance)
- [ ] Connect wallet from both a desktop and mobile browser
- [ ] Test purchase: **buy the 0.002 ETH starter pack** from a fresh wallet. 4 cards should reveal.
- [ ] Check **treasury tx on Basescan**: payment went to `0x1d43…5EB` ✓
- [ ] Play a bot match → win → verify **0.002 ETH landed in the player wallet**
- [ ] Loss case → verify 0.001 ETH drained to **operator `0x5A31`** (bot loses = treasury gains)
- [ ] Leaderboard shows new claim within 15s
- [ ] `/health/treasury` returns `low: false` with balance you funded

### 2.4 Monitoring dashboards

| Endpoint | What it tells you |
|---|---|
| `https://backend-…railway.app/health` | Process alive? |
| `https://backend-…railway.app/health/treasury` | Operator balance + `low` flag |
| Basescan watch on `0x1d43…5EB` | Revenue accumulating? |
| Basescan watch on `0x5A31…6568` | Operator draining too fast? |
| Vercel analytics | Traffic, error rate, p95 |
| Railway logs grep `PAYOUT` | Failed match settlements |

---

## 3. Emergency levers

| Problem | Lever |
|---|---|
| **Mass pack/match tx failures** | `vercel env set NEXT_PUBLIC_MAINTENANCE_MODE true && vercel --prod` — stops new tx inflight; early-access stays reachable |
| **Operator out of ETH** | Send ETH → `0x5A31…6568`. Backend auto-retries pending tx next settlement |
| **RPC degraded** | Update `BASE_RPC_URL` to fallback provider, redeploy backend |
| **Contract bug discovered** | Call `pause()` on PackStore / Marketplace / Escrow from admin wallet (contracts expose Pausable). Stops new deposits instantly |
| **Treasury wallet compromised** | Call `setTreasury(newAddress)` on both contracts. Funds from that point redirect. **Not** retroactive |
| **Backend crash** | Railway auto-restarts. If recurring, `git revert` last commit, force-redeploy |
| **Early-access flood** | leaderboard endpoint is CDN-cached (10s s-maxage); scales horizontally at Vercel edge |
| **Abusive wallet (multi-claim)** | DB has UNIQUE on `x_user_id`; at EVM layer it's fresh request per signer. If sophisticated abuse detected, block wallet via Vercel edge middleware |

---

## 4. Rollback

If something is catastrophically wrong and you need to rewind:

1. Flip `NEXT_PUBLIC_MAINTENANCE_MODE=true`, redeploy frontend. Takes
   ~30 seconds. Players see maintenance screen, early-access works.
2. Preserve logs + Basescan tx hashes of the affected time window.
3. If frontend regression: `vercel rollback --scope agntteam` picks a
   previous deploy. If backend regression: Railway → Deployments →
   pick an older green deploy → Redeploy.
4. Contracts are not upgradable — you **cannot** roll back bytecode.
   For a genuine contract bug, pause + redeploy new contracts + swap
   env addresses + the frontend's next deploy points at the new ones.

---

## 5. Known operational tradeoffs

- **Single operator wallet** for both deploy-admin and match-payout
  signing. Simpler ops, but the key rotation plan must touch both
  the backend `.env` AND re-grant OPERATOR_ROLE to the new key on
  the escrow contract.
- **Public RPC fallback** — if BOTH your primary AND fallback fail,
  pack/match verification fails cleanly (retries 3 × then surfaces
  "X_API 5xx / timeout"). Users retry their claim; backend is
  idempotent by tx hash.
- **Socket.io single-process** — OK at 1-2K concurrent with Node's
  default worker; beyond that add a Redis adapter and run multiple
  backend replicas behind Railway's built-in load balancer.
- **Leaderboard cache 10s** — new claims appear within 10-25 seconds
  on other viewers' tabs (10s CDN + 15s client polling). Acceptable
  for launch; shorten polling interval if you see complaints.

---

## 6. Post-launch tidy-up (within 7 days)

- [ ] Rotate the test-launch operator key to a production hot wallet
      with only OPERATOR_ROLE (not DEFAULT_ADMIN_ROLE), keeping
      admin on a cold key.
- [ ] Split revenue wallet (`0x1d43…5EB`) from operator wallet —
      already done on-chain, just confirm revenue flows look right
      after the first few days and the operator keeps ~0.1 ETH
      working balance.
- [ ] Add an automated job that sweeps `0x5A31…6568` → `0x1d43…5EB`
      when operator balance exceeds 0.5 ETH (bot-loss drains
      accumulate there; don't want a hot wallet hoarding fees).
- [ ] Set up Basescan alerts on the three contracts for any
      unexpected events (e.g. `Paused`, `AdminRoleGranted`).
- [ ] If contracts get heavy traffic, consider moving the leaderboard
      endpoint to Next's ISR with 60s revalidate (DB cheaper still).
