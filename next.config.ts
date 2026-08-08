import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Keep node-only modules out of client bundles (wagmi/viem polyfills).
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
  // The custom domain is canonical. The Vercel production alias
  // (cadenceonarc.vercel.app) otherwise serves a 200 of its own, so a relative
  // link like the footer logo keeps people on that host. Funnel it to the .tech
  // domain so every internal link resolves against the canonical origin.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "cadenceonarc.vercel.app" }],
        destination: "https://www.cadenceonarc.tech/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
