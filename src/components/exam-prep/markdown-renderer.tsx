'use client'

/**
 * MarkdownRenderer — Rendu Markdown léger pour les réponses de l'IA.
 *
 * Problème résolu : l'IA répond en Markdown (**gras**, listes, titres,
 * code inline) mais le chat l'affichait en texte brut, laissant les
 * marqueurs `**` et `[...]` visibles et rendant la lecture difficile.
 *
 * Utilise react-markdown (déjà dans le projet, v10) avec :
 *  - support du gras/italique/titres/listes/code inline/bloc
 *  - styling Tailwind cohérent avec le chat (prose-like manuel pour
 *    éviter la dépendance à @tailwindcss/typography)
 *  - sécurité : react-markdown échappe le HTML par défaut (pas de
 *    dangerouslySetInnerHTML)
 *
 * Nettoie aussi les citations [Chapitre X] qui sont déjà extraites
 * séparément (affichées sous le message) pour éviter les doublons.
 */

import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  // Nettoie les citations [Chapitre X] / [Chapitre X : titre] du texte
  // (elles sont affichées séparément sous le message via le système de citations)
  const cleaned = content.replace(/\[Chapitre\s+\d+(?:\s*[:\-]\s*[^\]]+)?\]/gi, '')

  return (
    <div className={cn('text-sm leading-relaxed space-y-2', className)}>
      <ReactMarkdown
        components={{
          // Titres
          h1: ({ children }) => <p className="font-bold text-base mt-2 mb-1">{children}</p>,
          h2: ({ children }) => <p className="font-bold text-sm mt-2 mb-1">{children}</p>,
          h3: ({ children }) => <p className="font-semibold text-sm mt-1.5 mb-0.5">{children}</p>,
          // Paragraphes
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          // Gras / italique : react-markdown gère via <strong>/<em>
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          // Listes
          ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          // Code inline
          code: ({ className: codeClass, children, ...props }) => {
            const isInline = !codeClass?.includes('language-')
            if (isInline) {
              return (
                <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono" {...props}>
                  {children}
                </code>
              )
            }
            return (
              <code className={cn('block px-3 py-2 rounded bg-muted text-xs font-mono overflow-x-auto', codeClass)} {...props}>
                {children}
              </code>
            )
          },
          // Bloc de code
          pre: ({ children }) => <pre className="my-2">{children}</pre>,
          // Séparateurs horizontaux (--- dans la réponse IA)
          hr: () => <hr className="my-2 border-border/60" />,
          // Citations blockquote
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/40 pl-3 italic text-muted-foreground my-1">
              {children}
            </blockquote>
          ),
          // Liens
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary-text underline">
              {children}
            </a>
          ),
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  )
}
