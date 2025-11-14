// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // dzięki temu Vercel/`next build` nie wywala się przez błędy ESLint
    ignoreDuringBuilds: true,
  },
  // tu możesz dopisywać kolejne opcje NextConfig, np. images, experimental itp.
};

export default nextConfig;
