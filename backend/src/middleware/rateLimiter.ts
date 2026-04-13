import rateLimit from "express-rate-limit";

// General API rate limit: anti-DDoS only
// 10000 req/min per IP — only blocks aggressive bots, not real users
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, slow down" },
});

// Pack purchase: no practical limit per wallet (they pay SOL per pack)
// 1000 req/min — only blocks automated abuse, not real purchases
export const packLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.body?.walletAddress || req.ip || "unknown";
  },
  message: { error: "Too many requests. Please wait a moment." },
});

// Marketplace buy: no practical limit per wallet (they pay SOL per purchase)
// 1000 req/min — only blocks automated abuse, not real purchases
export const marketplaceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.body?.buyerWallet || req.ip || "unknown";
  },
  message: { error: "Too many requests. Please wait a moment." },
});
