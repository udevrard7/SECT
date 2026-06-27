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
  // BUGFIX (QUOTA-FIX-1) : rewrites /api/* → Render déplacés vers vercel.json.
  // Raison : les rewrites afterFiles de next.config.ts s'exécutent APRÈS le
  // middleware Edge → chaque /api/* réveillait le middleware (compté comme
  // Function Invocation sur Vercel). Avec vercel.json rewrites, le routage
  // /api/* → Render se fait au niveau CDN pur (0 invocation middleware, 0 CPU).
  // Le cookie httpOnly est forwardé nativement par le CDN Vercel.
};

export default nextConfig;
