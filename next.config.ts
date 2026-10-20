import type { NextConfig } from "next";

const nextConfig: NextConfig = {

    async headers() {
      // CORS for /api/* is handled dynamically in middleware.ts
      // (it echoes the request Origin from an allowlist and answers preflights).
      return [];
    }
  
};

export default nextConfig;
