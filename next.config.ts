// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Typed Routes jest stabilne – poza experimental
  typedRoutes: true, // :contentReference[oaicite:2]{index=2}

  // Włącz lintowanie w buildzie (usuwa "Linting is disabled.")
  eslint: {
    ignoreDuringBuilds: false, // :contentReference[oaicite:3]{index=3}
  },

  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, max-age=0, must-revalidate",
          },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, max-age=0, must-revalidate",
          },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
