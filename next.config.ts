// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // nowa flaga dla Next 15 – zamiast experimental.typedRoutes
  typedRoutes: true,
};

export default nextConfig;
