# Agents Cup

A FIFA Ultimate Team-inspired pixel football card game on the Solana blockchain where all players and managers are AI/tech-culture themed agents.

## Features

- **100 Unique Agent Cards** — AI-themed footballers with 4 rarity tiers (Common, Rare, Epic, Legendary)
- **Pack Store** — Buy packs with SOL to get random agent NFTs with animated pack opening
- **Squad Builder** — Build squads with 4 formations (4-3-3, 4-4-2, 3-5-2, 4-2-3-1) and chemistry system
- **Match Engine** — Deterministic 90-minute match simulation with live commentary feed
- **Marketplace** — Buy/sell/trade agent NFTs with fixed price and auction listings
- **Solana Integration** — Wallet connection (Phantom, Backpack, Solflare), SOL payments on devnet

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, TypeScript, TailwindCSS |
| Wallet | @solana/wallet-adapter (Phantom, Backpack, Solflare) |
| Blockchain | Solana devnet, Anchor framework |
| NFT Standard | Metaplex Core |
| Backend | Node.js, Express, Socket.io |
| Database | PostgreSQL (Prisma ORM) |

## Project Structure

```
agentscup/
├── frontend/          # Next.js 16 app
│   ├── src/
│   │   ├── app/       # Pages (home, packs, collection, squad, match, marketplace)
│   │   ├── components/# React components (cards, layout, squad, ui)
│   │   ├── contexts/  # Wallet provider
│   │   ├── data/      # Agent roster (100 players + 5 managers)
│   │   ├── lib/       # Utilities, match engine
│   │   └── types/     # TypeScript types
│   └── ...
├── backend/           # Express + Socket.io server
│   ├── src/
│   │   ├── routes/    # API endpoints
│   │   ├── services/  # Pack opening, ELO calculation
│   │   ├── engine/    # Match simulation engine
│   │   ├── socket/    # Real-time match rooms
│   │   └── __tests__/ # Unit tests (Jest)
│   └── prisma/        # Database schema
├── contracts/         # Anchor smart contracts (Rust)
│   └── programs/agents_cup/src/lib.rs
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL
- Solana CLI + Anchor CLI (for smart contracts)
- A Solana wallet (Phantom recommended)

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL connection string

npm install
npx prisma generate
npx prisma db push
npm run dev
```

Backend runs on [http://localhost:4000](http://localhost:4000).

### Running Tests

```bash
cd backend
npm test
```

Runs 20 unit tests covering:
- Match engine determinism and correctness
- Pack opening probability distribution
- ELO rating calculation

### Smart Contracts (Devnet)

```bash
cd contracts
anchor build
anchor deploy --provider.cluster devnet
```

## Agent Roster

100 players + 5 managers across all positions:

| Position | Count | Examples |
|----------|-------|---------|
| GK | 10 | G-P-T Zero (92), Claude Keeper (89) |
| CB/LB/RB | 25 | Transformer Block (91), Attention Stopper (90) |
| CDM/CM/CAM | 30 | Neural Maestro (95), Prompt Engineer (93) |
| ST/LW/RW | 30 | GPT Striker (99), Claude Dribbler (97) |
| MGR | 5 | Alan Turing 2.0 (99), Yann LeCun Bot (96) |

### Rarity Tiers

| Rarity | Rating Range | Color |
|--------|-------------|-------|
| Common | 60-74 | White |
| Rare | 75-84 | Cyan |
| Epic | 85-92 | Silver |
| Legendary | 93-99 | Gold |

## Pack Types

| Pack | Price | Cards | Rare Guarantee | Epic % | Legendary % |
|------|-------|-------|----------------|--------|-------------|
| Starter | 0.1 SOL | 5 | 1 | 10% | 2% |
| Pro | 0.25 SOL | 8 | 2 | 20% | 5% |
| Elite | 0.5 SOL | 12 | 3 | 35% | 12% |
| Legendary | 1.0 SOL | 15 | 5 | 50% | 25% |

## Important Notes

- All transactions use Solana **devnet** — no real SOL required for testing
- The match engine is fully deterministic (same seed = same result)
- Smart contract addresses are placeholders — deploy your own on devnet
- Treasury receives 90% of pack sales, 10% goes to prize pool PDA
- Marketplace charges 2.5% platform fee on sales

## License

MIT
