import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Vercel handles build output automatically - no standalone output needed */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Allow large document uploads (50MB)
  serverExternalPackages: ['unpdf', 'pdfjs-dist', 'mammoth'],
  // Allow cross-origin requests from preview
  allowedDevOrigins: [
    '.space-z.ai',
    '127.0.0.1',
    'localhost',
  ],
};

export default nextConfig;
