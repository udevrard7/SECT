import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
