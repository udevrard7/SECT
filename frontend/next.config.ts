import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: true,
  serverExternalPackages: ['unpdf', 'pdfjs-dist', 'mammoth'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: '**.onrender.com' },
      { protocol: 'https', hostname: 'vercel.com' },
      { protocol: 'https', hostname: '**.vercel.app' },
    ],
  },
  // Le proxy /api/* est géré par src/proxy.ts (proxy direct avec injection Authorization)
  // Pas de rewrite next.config.ts car les rewrites ne forwardent pas les headers modifiés
};

export default nextConfig;
