import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Vercel handles build output automatically - no standalone output needed */
  // ── Type safety : le build Vercel échoue en cas d'erreur TypeScript.
  //    Audit : 0 erreur TS au passage en strict, donc safe d'activer.
  //    Précédemment à true, ce qui laissait passer des bugs de typage en prod.
  typescript: {
    ignoreBuildErrors: false,
  },
  // ── Strict Mode React : détecte les effets de bord, APIs dépréciées et
  //    bugs subtils (double-render en dev). Précédemment à false.
  reactStrictMode: true,
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
};

export default nextConfig;
