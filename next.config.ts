import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Keep node-only modules out of client bundles (wagmi/viem polyfills).
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
};

export default nextConfig;
