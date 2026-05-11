import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
  },
  // Native .node bindings — must not be bundled by Turbopack
  serverExternalPackages: ["@resvg/resvg-js"],
};

export default nextConfig;
