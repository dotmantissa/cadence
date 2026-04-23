import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // RainbowKit / wagmi need this for some polyfills
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
};

export default nextConfig;
