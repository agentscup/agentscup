import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import userRoutes from "./routes/users";
import agentRoutes from "./routes/agents";
import packRoutes from "./routes/packs";
import squadRoutes from "./routes/squads";
import matchRoutes from "./routes/matches";
import marketplaceRoutes from "./routes/marketplace";
import leaderboardRoutes from "./routes/leaderboard";
import { setupMatchSocket } from "./socket/matchSocket";
import { generalLimiter } from "./middleware/rateLimiter";
import { publicClient, treasuryAddress, MATCH_ENTRY_FEE_WEI } from "./lib/evm";
import { formatEther } from "viem";

dotenv.config();

// Warn loudly when the operator wallet gets thin. The backend
// still functions but match payouts will fail with "insufficient
// funds" once the balance can't cover the top-up + gas. Pick a
// threshold that gives ops a window to refund before payouts
// actually start failing — here: 10 × the entry fee (0.01 ETH
// default), enough for ~10 bot-wins worth of top-ups.
const TREASURY_LOW_BALANCE_WARN_WEI = MATCH_ENTRY_FEE_WEI * 10n;

const app = express();
const httpServer = createServer(app);
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:3000")
  .split(",")
  .map((u) => u.trim());

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "10mb" }));
app.use(generalLimiter);

// Health check
app.get("/health", (_, res) =>
  res.json({ status: "ok", timestamp: new Date().toISOString() })
);

// Treasury health — exposes the operator wallet's on-chain balance
// so ops / uptime monitors can alarm on "treasury running dry"
// before match payouts start failing. Response is deliberately
// uncached so monitors always see the live balance.
app.get("/health/treasury", async (_, res) => {
  try {
    const addr = treasuryAddress();
    if (!addr) {
      res.status(503).json({ status: "not configured" });
      return;
    }
    const bal = await publicClient.getBalance({ address: addr });
    const thresholdWei = TREASURY_LOW_BALANCE_WARN_WEI;
    const low = bal < thresholdWei;
    res.setHeader("Cache-Control", "no-store");
    res.json({
      address: addr,
      balanceWei: bal.toString(),
      balanceEth: formatEther(bal),
      low,
      thresholdEth: formatEther(thresholdWei),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    res.status(500).json({ status: "rpc error", error: msg });
  }
});

// Routes
app.use("/api/users", userRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/packs", packRoutes);
app.use("/api/squads", squadRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/marketplace", marketplaceRoutes);
app.use("/api/leaderboard", leaderboardRoutes);

// Socket.io for real-time matches
setupMatchSocket(io);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, async () => {
  console.log(`Agents Cup Backend running on port ${PORT}`);
  console.log(`Supabase:  ${process.env.SUPABASE_URL ? "configured" : "NOT configured"}`);
  console.log(`Base RPC:  ${process.env.BASE_RPC_URL || "(public mainnet.base.org — rate-limited, not for launch)"}`);
  console.log(`Fallback:  ${process.env.BASE_RPC_URL_FALLBACK || "(same as primary)"}`);
  console.log(`Chain:     Base mainnet (8453)`);
  console.log(`PackStore: ${process.env.PACK_STORE_ADDRESS || "NOT SET"}`);
  console.log(`Marketpl.: ${process.env.MARKETPLACE_ADDRESS || "NOT SET"}`);
  console.log(`Escrow:    ${process.env.MATCH_ESCROW_ADDRESS || "NOT SET"}`);
  console.log(`Treasury:  ${process.env.TREASURY_PRIVATE_KEY ? "configured" : "NOT SET"}`);

  // Pre-flight treasury balance check — launch readiness signal.
  const addr = treasuryAddress();
  if (addr) {
    try {
      const bal = await publicClient.getBalance({ address: addr });
      const eth = formatEther(bal);
      if (bal < TREASURY_LOW_BALANCE_WARN_WEI) {
        console.warn(
          `\n⚠  TREASURY LOW — operator ${addr} has only ${eth} ETH.\n` +
          `   Match-win top-ups will start failing once the balance\n` +
          `   can't cover a 0.001 ETH transfer + gas. Refund soon.\n`
        );
      } else {
        console.log(`Operator bal: ${eth} ETH ✓`);
      }
    } catch {
      console.warn("Treasury pre-flight balance check skipped (RPC error).");
    }
  }
});

export { io };
