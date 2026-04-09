import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Cache RSC payloads for dynamic routes — makes back-navigation instant
    staleTimes: {
      dynamic: 0,    // always refetch RSC on navigation — prevents stale goal/pitstop data
      static: 180,
    },
  },
};

export default nextConfig;
