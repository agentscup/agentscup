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

dotenv.config();

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

// Treasury diagnostic (temporary — remove after debugging)
app.get("/debug/treasury", async (_, res) => {
  try {
    const { Connection, PublicKey, Keypair } = await import("@solana/web3.js");
    const treasuryWalletEnv = process.env.TREASURY_WALLET || "NOT SET";
    const hasPrivateKey = !!process.env.TREASURY_PRIVATE_KEY;
    let derivedAddress = "N/A";
    let keyLength = 0;
    let parseError = "";

    if (hasPrivateKey) {
      try {
        const raw = process.env.TREASURY_PRIVATE_KEY!;
        const parsed = JSON.parse(raw);
        keyLength = parsed.length;
        const kp = Keypair.fromSecretKey(Uint8Array.from(parsed));
        derivedAddress = kp.publicKey.toBase58();
      } catch (e: any) {
        parseError = e.message;
      }
    }

    const rpc = process.env.SOLANA_RPC_URL || "not set";
    let balance = -1;
    try {
      const conn = new Connection(rpc, "confirmed");
      balance = await conn.getBalance(new PublicKey(treasuryWalletEnv));
    } catch {}

    res.json({
      treasuryWallet: treasuryWalletEnv,
      hasPrivateKey,
      keyLength,
      derivedAddress,
      match: derivedAddress === treasuryWalletEnv,
      parseError: parseError || undefined,
      balanceLamports: balance,
      balanceSol: balance / 1e9,
      rpcConfigured: !!process.env.SOLANA_RPC_URL,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
httpServer.listen(PORT, () => {
  console.log(`Agents Cup Backend running on port ${PORT}`);
  console.log(`Supabase: ${process.env.SUPABASE_URL ? "configured" : "NOT configured"}`);
  console.log(`Solana RPC: ${process.env.SOLANA_RPC_URL || "devnet (default)"}`);
  console.log(`Treasury wallet: ${process.env.TREASURY_WALLET || "NOT SET"}`);
  console.log(`Treasury key: ${process.env.TREASURY_PRIVATE_KEY ? "configured" : "NOT SET"}`);
});

export { io };
