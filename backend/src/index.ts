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
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
app.use(express.json({ limit: "10mb" }));
app.use(generalLimiter);

// Health check
app.get("/health", (_, res) =>
  res.json({ status: "ok", timestamp: new Date().toISOString() })
);

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
});

export { io };
