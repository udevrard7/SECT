import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Vercel handles build output automatically - no standalone output needed */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Allow large document uploads (50MB)
  serverExternalPackages: ['pdf-parse', 'mammoth'],
};

export default nextConfig;
