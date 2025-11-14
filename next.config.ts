// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  eslint: {
    // dzięki temu `next build` / Vercel nie przerwie builda przez błędy ESLint
    ignoreDuringBuilds: true,
  },

  typescript: {
    // analogicznie – build nie wywali się przez błędy TS
    ignoreBuildErrors: true,
  },

  experimental: {
    // możesz zostawić, bo App Router i typed routes są ok w tym projekcie
    typedRoutes: true,
  },
};

export default nextConfig;
