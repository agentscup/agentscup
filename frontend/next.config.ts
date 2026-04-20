import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Friendly short URL for the early-access funnel. The underlying
      // page stays at /early-access so deep links, OG metadata, and
      // share cards keep working unchanged.
      { source: "/early", destination: "/early-access" },
      { source: "/early/:path*", destination: "/early-access/:path*" },
    ];
  },
};

export default nextConfig;
