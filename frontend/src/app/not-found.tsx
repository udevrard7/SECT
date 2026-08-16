import Link from 'next/link'
import { Compass, Home } from 'lucide-react'

export const metadata = {
  title: 'Page introuvable — SECT',
  description: 'La page que vous cherchez n\'existe pas.',
}

/**
 * not-found.tsx — Page 404 custom (App Router).
 *
 * SECT-RESILIENCE-1 : remplace la page 404 générique de Next.js par une page
 * aux couleurs SECT (kente watermark, icône, message clair). S'affiche quand :
 *   - Une route inexistante est demandée
 *   - notFound() est appelé depuis un Server Component
 *
 * Server Component (préserve metadata SEO).
 */
export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6 ds-kente-watermark rounded-2xl p-8">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
            <Compass className="h-10 w-10 text-muted-foreground" />
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-display text-6xl font-bold tracking-tight text-primary">
            404
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Page introuvable
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            La page que vous cherchez n&apos;existe pas ou a été déplacée.
            Vérifiez l&apos;URL ou revenez au tableau de bord.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Home className="h-4 w-4" />
            Tableau de bord
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-md border border-border bg-card text-foreground text-sm font-medium hover:bg-accent transition-colors"
          >
            Accueil
          </Link>
        </div>
      </div>
    </main>
  )
}
