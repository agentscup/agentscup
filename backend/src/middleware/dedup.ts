import { Request, Response, NextFunction } from "express";

/**
 * In-memory request deduplication.
 * Prevents the same txSignature from being processed concurrently.
 * If a request with the same key is already in-flight, reject the duplicate.
 */
const inFlight = new Map<string, number>();

// Clean up stale entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of inFlight) {
    if (now - timestamp > 120_000) {
      inFlight.delete(key);
    }
  }
}, 60_000);

export function dedup(keyExtractor: (req: Request) => string | null) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyExtractor(req);
    if (!key) {
      next();
      return;
    }

    if (inFlight.has(key)) {
      res.status(409).json({
        error: "This transaction is already being processed. Please wait.",
      });
      return;
    }

    inFlight.set(key, Date.now());

    // Remove from in-flight when response finishes
    res.on("finish", () => {
      inFlight.delete(key);
    });

    next();
  };
}
