import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: true,
  serverExternalPackages: ['unpdf', 'pdfjs-dist', 'mammoth', '@react-pdf/renderer', 'yoga-layout'],
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
  //
  // DEV LOCAL (SECT-LOCAL-DEV) : en `next dev`, vercel.json n'est PAS appliqué.
  // Sans rewrite, les appels /api/* (documents, epreuves, sessions…) 404.
  // On ajoute donc un rewrite DEV-ONLY qui proxy /api/* → backend Go local.
  // afterFiles = Next.js vérifie d'abord les routes existantes (go-auth/*, PDF
  // routes) puis fallback sur le proxy. Aucun impact en production (gated par
  // NODE_ENV === 'development').
  async rewrites() {
    if (process.env.NODE_ENV === 'development') {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
      return [
        {
          source: '/api/:path*',
          destination: `${backendUrl}/api/:path*`,
        },
      ]
    }
    return []
  },
};

export default nextConfig;
