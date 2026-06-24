import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Vercel handles build output automatically - no standalone output needed */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Allow large document uploads (50MB)
  serverExternalPackages: ['unpdf', 'pdfjs-dist', 'mammoth'],
  // ── next/image : autorise les URLs externes (avatars Supabase, thumbnails) ──
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.supabase.in' },
      { protocol: 'https', hostname: 'vercel.com' },
      { protocol: 'https', hostname: '**.vercel.app' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
  // Allow cross-origin requests from preview
  allowedDevOrigins: [
    '.space-z.ai',
    '*.space-z.ai',
    'preview-chat-b61af912-02fe-46ad-825a-4ef8ed9cc364.space-z.ai',
    '127.0.0.1',
    'localhost',
    '21.0.3.198',
    '21.0.8.105',
    '21.0.8.90',
    '21.0.10.175',
  ],
};

export default nextConfig;
