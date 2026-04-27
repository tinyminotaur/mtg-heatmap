import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  /** Ship seeded SQLite with serverless routes (written during Vercel `pnpm run build`). */
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/mtg.db"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cards.scryfall.io", pathname: "/**" },
      { protocol: "https", hostname: "c1.scryfall.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
