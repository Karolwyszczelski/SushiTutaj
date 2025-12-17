// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

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