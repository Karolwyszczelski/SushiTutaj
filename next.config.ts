// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

    async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, max-age=0, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, max-age=0, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },


  // 1. Konfiguracja dla zdjęć z Supabase (Pop-up)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        // Używamy wildcarda (**.supabase.co), żeby działało z każdym projektem Supabase.
        // Jeśli wolisz, możesz wpisać tu konkretny adres: 'twoje-id.supabase.co'
        hostname: "**.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  // 2. Flaga Typed Routes (w Next 15 nadal bezpieczniej trzymać to w experimental)
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;