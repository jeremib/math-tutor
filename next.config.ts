import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  experimental: {
    // Homework photos from phones can be several megabytes.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
