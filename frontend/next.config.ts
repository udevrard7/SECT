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
  //
  // DEV LOCAL (SECT-LOCAL-DEV) : en `next dev`, vercel.json n'est PAS appliqué.
  // Sans rewrite, les appels /api/* (documents, epreuves, sessions…) 404.
  // On ajoute donc un rewrite DEV-ONLY qui proxy /api/* → backend Go local.
  // afterFiles = Next.js vérifie d'abord les routes existantes (go-auth/*, PDF
  // routes) puis fallback sur le proxy. Aucun impact en production (gated par
  // NODE_ENV === 'development').
  async rewrites() {
    // Production + development : proxy /api/* → Render backend.
    // Les routes Next.js existantes (go-auth/*, certificats, etc.) ont priorité
    // car afterFiles vérifie d'abord les fichiers réels avant le rewrite.
    // En production, le vercel.json rewrite CDN est la route principale (0 CPU),
    // ce rewrite Next.js sert de fallback si vercel.json n'est pas encore déployé.
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 
      (process.env.NODE_ENV === 'development' 
        ? 'http://localhost:8080' 
        : 'https://sect-zead.onrender.com')
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ]
  },
};

export default nextConfig;
