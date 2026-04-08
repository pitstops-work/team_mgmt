import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Cache RSC payloads for dynamic routes — makes back-navigation instant
    staleTimes: {
      dynamic: 30,   // seconds — revisiting a dynamic page within 30s uses cached RSC
      static: 180,
    },
  },
};

export default nextConfig;
