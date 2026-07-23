'use client'

/**
 * global-error.tsx — Error boundary racine (App Router Next.js 16).
 *
 * SECT-RESILIENCE-1 : attrape TOUTES les erreurs non catchées, y compris
 * celles dans le layout root (layout.tsx). Sans ce fichier, Next.js affiche
 * une page d'erreur générique ou une page blanche en production.
 *
 * IMPORTANT : ce fichier DOIT définir ses propres <html> et <body> car il
 * remplace entièrement le layout root quand une erreur fatale se produit.
 * Il ne peut PAS utiliser les composants du layout (Providers, Toaster, etc.)
 * car ceux-ci peuvent être la cause de l'erreur.
 *
 * Design minimal mais cohérent avec SECT (icône, message clair, bouton reload).
 * Pas de dépendance externe (pas de Tailwind globals.css non plus — styles inline
 * pour garantir l'affichage même si le CSS a échoué à charger).
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Log l'erreur pour observabilité (en prod, sera capturé par Vercel)
  if (typeof console !== 'undefined' && console.error) {
    console.error('SECT global error:', error)
  }

  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f8fafc',
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              maxWidth: '28rem',
              width: '100%',
              textAlign: 'center',
              background: '#ffffff',
              borderRadius: '1rem',
              padding: '2rem',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
            }}
          >
            <div
              style={{
                height: '5rem',
                width: '5rem',
                borderRadius: '50%',
                background: '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem',
                fontSize: '2rem',
              }}
              aria-hidden="true"
            >
              ⚠️
            </div>
            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: '#0f172a',
                marginBottom: '0.5rem',
              }}
            >
              Une erreur inattendue s&apos;est produite
            </h1>
            <p
              style={{
                fontSize: '0.875rem',
                color: '#64748b',
                lineHeight: 1.6,
                marginBottom: '1.5rem',
              }}
            >
              Ne vous inquiétez pas, vos données sont sécurisées. Essayez de
              recharger la page. Si le problème persiste, vous serez redirigé
              vers une page de maintenance.
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <button
                onClick={reset}
                style={{
                  height: '2.75rem',
                  padding: '0 1.25rem',
                  borderRadius: '0.375rem',
                  background: '#0f766e',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Réessayer
              </button>
              <a
                href="/maintenance"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '2.75rem',
                  padding: '0 1.25rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                Page de maintenance
              </a>
            </div>
            {error.digest && (
              <p
                style={{
                  fontSize: '0.75rem',
                  color: '#94a3b8',
                  marginTop: '1.5rem',
                  fontFamily: 'monospace',
                }}
              >
                Réf. incident : {error.digest}
              </p>
            )}
          </div>
        </main>
      </body>
    </html>
  )
}
