import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://sect-s1pb.onrender.com'

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
  // Rewrite: /api/* → Go backend. Le proxy.ts injecte Authorization: Bearer
  // avant que le rewrite ne s'exécute (afterFiles).
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
