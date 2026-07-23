import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { PushNotificationManager } from "@/components/pwa/push-notification-manager";

// ── Design System fonts ──
// Inter : display (titres) + body (corps) — weights 400/500/700
// JetBrains Mono : code, stats numériques, monospace
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://sect-app.vercel.app"),
  title: "SECT — Vos examens corrigés par l'IA en 2 minutes",
  description:
    "SECT génère vos sujets par IA, surveille les examens en ligne et corrige automatiquement. Conçu pour les universités et écoles d'Afrique. Essai gratuit, sans carte bancaire.",
  keywords: [
    "évaluation en ligne",
    "examen IA",
    "correction automatique",
    "université Afrique",
    "QCM en ligne",
    "proctoring",
    "plateforme évaluation",
    "Franc CFA",
  ],
  authors: [{ name: "SECT" }],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "SECT — Vos examens corrigés par l'IA en 2 minutes",
    description:
      "Génération de sujets, surveillance anti-fraude et correction automatique pour les universités africaines. Essai gratuit.",
    images: ["/logo.png"],
    url: "https://sect-app.vercel.app",
    siteName: "SECT",
    type: "website",
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "SECT — Examens corrigés par l'IA",
    description: "La plateforme d'évaluation IA pour les universités d'Afrique.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SECT",
  applicationCategory: "EducationApplication",
  operatingSystem: "Web",
  description:
    "Plateforme d'évaluation IA pour l'enseignement supérieur : génération de sujets, surveillance des examens et correction automatique.",
  offers: [
    { "@type": "Offer", name: "Starter", price: "30000", priceCurrency: "XOF", description: "30000 FCFA/mois" },
    { "@type": "Offer", name: "Professionnel", price: "80000", priceCurrency: "XOF", description: "80000 FCFA/mois" },
  ],
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.9",
    reviewCount: "15",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* ── PWA & Mobile meta ── */}
        <meta name="application-name" content="SECT" />
        <meta name="theme-color" content="#4F46E5" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0F172A" media="(prefers-color-scheme: dark)" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SECT" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
        </Providers>
        <ServiceWorkerRegister />
        <PushNotificationManager />
        <Toaster />
        {/* BUGFIX (DUP-SRCDocs-1) : Sonner Toaster manquait — 57 fichiers
            utilisent `import { toast } from 'sonner'` mais le Toaster Sonner
            n'était jamais monté → tous les toasts (succès/erreur) étaient
            silencieusement ignorés. z-[100] pour apparaître au-dessus des
            dialogs (z-50) et de l'overlay. */}
        <SonnerToaster
          position="top-right"
          richColors
          closeButton
          style={{ zIndex: 100 }}
        />
      </body>
    </html>
  );
}
