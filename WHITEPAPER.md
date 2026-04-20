# Agents Cup — Whitepaper

**Version 1.0 · April 2026**

A pixel-art football game where you collect AI-themed agent cards,
build a squad, and play real-time simulated matches against other
players. Fully on-chain payments, fully off-chain gameplay.

---

## 1. What Agents Cup is

Agents Cup is a card-collection football game with three loops:

- **Collect.** Open packs to pull agent cards. Each agent has a
  position, six attributes, a tech-stack theme, and a rarity.
- **Build.** Assemble an eleven-man squad in a chosen formation.
  Chemistry rewards smart pairings across tech stacks.
- **Battle.** Pay an entry fee, queue up, and play a 90-minute
  simulated match against another player. Winner takes the pot.

The game is designed to feel like a classic football card game —
fast, readable, pixel-art — with a Web3 economy bolted on where it
matters (ownership, trade, payouts) and off-chain where it doesn't
(match simulation, matchmaking, ELO, XP).

---

## 2. The migration to Base

Agents Cup launched on Solana with a $CUP token economy. After
iterating with users we moved the project to **Base**, Coinbase's
Ethereum L2, with a clean ETH-native economy.

Why the move:

- **Distribution.** Base is the most active consumer L2 on EVM today,
  with frictionless on-ramps via Coinbase and growing wallet coverage.
- **Simplicity.** Native ETH for every action means no token approvals,
  no bridge, no migration pain for new users. One wallet, one asset.
- **Composability.** EVM tooling (Basescan, Safe, WalletConnect, the
  full Ethers/viem ecosystem) means faster iteration and safer custody
  for the treasury.

The $CUP token is retired on Base. Previous Solana balances are not
auto-bridged; the game is a fresh start on the new chain.

---

## 3. Gameplay

### 3.1 Agents

Each agent card is themed after a technology or AI concept (the
"tech stack" field) and has:

- **Position** — GK, CB, LB, RB, CDM, CM, CAM, LW, RW, ST, or MGR.
- **Six attributes** — pace, shooting, passing, dribbling,
  defending, physical.
- **Overall rating** — derived from attributes, weighted by position.
- **Rarity** — common, rare, epic, legendary, mythic. Rarer cards
  draw higher attributes.

### 3.2 Squads

A squad is eleven on-field agents in one of the supported
formations (4-3-3, 4-4-2, 3-5-2, etc.) plus an optional manager.
Players earn a chemistry bonus for putting agents in their natural
positions and for tech-stack synergies.

### 3.3 Matches

A match is a 90-minute simulated game rendered as a ~60-second
live event stream. The engine is deterministic: seeded pseudo-random
numbers, identical outcomes on replay. Events include goals, shots,
saves, fouls, cards, possession swings, and a "man of the match"
at the whistle.

Queueing is real-time via Socket.IO. If no human opponent is found
within 20 seconds, a bot fallback kicks in so the player doesn't get
stuck. Bot matches use a lighter ELO share than PvP to keep the
ladder PvP-driven.

### 3.4 Progression

- **ELO.** Classic Elo with K=32. PvP win against an equal opponent
  is +16; bot win is +3.
- **XP.** Granted per match (30 win / 15 draw / 5 loss) and per
  pack opened.
- **Leaderboard.** Ranked by ELO. Seasonal resets keep it fresh.

---

## 4. Economy

Everything happens in native ETH on Base. No custom token.

### 4.1 Pack purchases

Packs are priced in ETH and sold via the `AgentsCupPackStore`
contract. The buyer sends ETH; the contract forwards it to the
treasury in the same transaction and emits `PackPurchased`. The
backend watches that event and credits agent cards to the buyer's
wallet.

Pack tiers and prices live in the backend so we can rebalance
without redeploying the contract.

### 4.2 Marketplace

`AgentsCupMarketplace` is a peer-to-peer ETH marketplace for agent
resale. Sellers list at a chosen price; buyers pay exactly that
amount. The contract splits the payment:

- **Seller gets 97.5%** of the sale price.
- **Treasury gets 2.5%** as a protocol fee (capped at 5%,
  adjustable by admin).

Agents themselves remain off-chain database records — the contract
is the payment + event rail that lets the backend transfer
ownership atomically with payment.

### 4.3 Match entry + payout

`AgentsCupMatchEscrow` holds both players' entry fees during a
match:

- **Entry fee:** 0.001 ETH per player (admin-tunable).
- **Win:** winner collects 0.002 ETH (both entries).
- **Draw:** each player is refunded their own 0.001 ETH.
- **Stall recovery:** if a match fails to settle, the admin can
  forfeit the pot to the non-abandoning player.

The backend holds an `OPERATOR_ROLE` and calls settlement after
the match simulation finishes. It is the only authority that can
move funds — the escrow is pure payment custody.

### 4.4 Treasury

Treasury on Base: `0x5794F733eE53DfFdbd023ba91d357D8aA334E414`.

It collects:

- 100% of pack revenue.
- 2.5% of marketplace volume.
- 0% of match pots (those go to the winners).

Treasury funds cover hosting, engine development, player rewards
and community initiatives.

---

## 5. Technology

### 5.1 Architecture split

- **Off-chain:** player accounts, agent ownership records, squad
  state, match engine, Socket.IO matchmaking, ELO, XP, leaderboard.
  Hosted on Supabase (Postgres) + a Node.js backend on Railway.
- **On-chain:** pack payment, marketplace payment + fee split,
  match escrow. Three contracts on Base, verified on Basescan.

This split is deliberate. The match engine needs millisecond-level
responsiveness that on-chain can't match, and the gameplay logic is
big and iterates often. Only the money moves on-chain, where
auditability and self-custody matter.

### 5.2 Determinism

The match engine is a Mulberry32 PRNG seeded per match. Given the
same two squads and the same seed, the output is byte-identical.
This gives us:

- Reconnect-proof simulations (resume mid-match from any event).
- Replayable match logs.
- A future path for on-chain result commitment if needed.

### 5.3 Smart contracts

| Contract                   | Purpose                                                   |
| -------------------------- | --------------------------------------------------------- |
| `AgentsCupPackStore`       | Pack purchase payment rail (ETH → treasury).              |
| `AgentsCupMarketplace`     | List / buy / cancel agents in ETH with a bps fee.         |
| `AgentsCupMatchEscrow`     | Hold entry fees, pay winner / refund on draw.             |

All three use OpenZeppelin's `AccessControl`, `ReentrancyGuard`,
and `Pausable`. Pausable lets us stop new activity cleanly during
incidents without locking existing funds. Contracts are **not
upgradeable** by design — migration is done by redeploy + swapping
the frontend env var, never by patching bytecode in place. No
rug-pull attack surface.

### 5.4 Security posture

- Treasury and admin roles separated from deployer where needed.
- Contracts verified on Basescan so bytecode is inspectable.
- No mint functions on the economy (no token).
- Marketplace escrow-less: funds never sit in the contract between
  transactions, minimising exposure.
- Match escrow only holds active-match entries; settlement is
  one-way out.

---

## 6. Roadmap

- **Q2 2026 — Base launch.** Three contracts deployed on Base
  mainnet, treasury live, frontend migrated to wagmi + viem,
  maintenance window closed.
- **Q3 2026 — Seasons and cosmetics.** Seasonal leaderboard resets
  with reward distributions from the treasury. Kit / crest
  customisation for squads.
- **Q4 2026 — Tournaments.** Scheduled bracket tournaments with
  entry fees pooled into a sponsored prize pot.
- **Later — On-chain replays.** Commit match seeds + outcomes
  on-chain for independently verifiable match history.

---

## 7. Links

- Play: https://play.agentscup.com
- Twitter / X: https://x.com/agentscup
- Basescan (after deploy): addresses to be posted under the treasury
  wallet `0x5794F733eE53DfFdbd023ba91d357D8aA334E414`.

---

*Agents Cup is a game. The ETH you spend on packs, marketplace, and
match entries is real. Play within your means. Nothing in this
document is financial advice.*
