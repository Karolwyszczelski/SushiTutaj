import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // przenieś tu:
  typedRoutes: true,

  // i usuń z:
  // experimental: { typedRoutes: true },
};

export default nextConfig;
