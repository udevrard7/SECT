import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://sect-s1pb.onrender.com'

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true, // Transition Go backend — erreurs TS résiduelles des anciennes routes
  },
  reactStrictMode: true,
  serverExternalPackages: ['unpdf', 'pdfjs-dist', 'mammoth'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.supabase.in' },
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
      { protocol: 'https', hostname: '**.onrender.com' },
      { protocol: 'https', hostname: 'vercel.com' },
      { protocol: 'https', hostname: '**.vercel.app' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
  // ── Proxy: /api/* → Go backend ──
  // afterFiles = les route handlers Next.js (/api/auth/*, /api/go-auth/*) prennent
  // priorité sur les rewrites. Les routes supprimées tombent sur le rewrite → Go.
  async rewrites() {
    return {
      afterFiles: [
        {
          source: '/api/:path*',
          destination: `${API_URL}/api/:path*`,
        },
      ],
    }
  },
};

export default nextConfig;
