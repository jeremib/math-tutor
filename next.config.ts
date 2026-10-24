import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    // Homework photos from phones can be several megabytes.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
