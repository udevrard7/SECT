'use client'

import { Component, type ReactNode } from 'react'

/**
 * QueryErrorBoundary — attrape les erreurs runtime (notamment les erreurs
 * de query TanStack non gérées) et affiche un message au lieu de crasher
 * toute la page.
 *
 * BUGFIX (QUERY-403-1) : certaines pages accessibles à plusieurs rôles
 * appellent des API qui retournent 403 (ex: /filieres pour un enseignant).
 * Le queryFn lance une erreur → sans boundary, React crash toute la page
 * ("Application error: a client-side exception has occurred").
 *
 * Avec ce boundary, l'erreur est attrapée et un message discret est affiché,
 * permettant à l'utilisateur de naviguer ailleurs.
 */
interface State {
  hasError: boolean
  error?: Error
}

export class QueryErrorBoundary extends Component<{ children: ReactNode }, State> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[QueryErrorBoundary] Erreur attrapée:', error.message, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
          <div className="max-w-md space-y-3">
            <h2 className="text-lg font-semibold text-foreground">
              Une erreur est survenue
            </h2>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message || 'Une erreur inattendue s&apos;est produite.'}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: undefined })}
              className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Réessayer
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
