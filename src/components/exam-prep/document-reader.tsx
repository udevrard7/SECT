'use client'

/**
 * DocumentReader — Visionneuse de document intégrée (modal).
 *
 * Affiche le contenu textuel d'un document dans un dialog plein écran,
 * permettant à l'étudiant de lire le cours directement dans SECT sans
 * téléchargement. Inclut :
 *  - En-tête : nom, UE, auteur, date, thèmes
 *  - Zone de lecture scrollable avec contenu formaté
 *  - Bouton télécharger (TXT ou PDF)
 *  - Recherche dans le texte (Ctrl+F natif du navigateur)
 */

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Download, Loader2, FileText, BookOpen, User, Calendar,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface ReaderDocument {
  id: string
  nomFichier: string
  contenuTexte: string | null
  typeMime: string | null
  themesDetectes: string[]
  resumeAnalyse: string | null
  dateUpload: string
  owner: { name: string }
  uniteEnseignement: { code: string; nom: string } | null
}

interface Props {
  documentId: string | null
  onClose: () => void
}

export function DocumentReader({ documentId, onClose }: Props) {
  const [doc, setDoc] = useState<ReaderDocument | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [fontSize, setFontSize] = useState(14)

  const loadDoc = useCallback(async () => {
    if (!documentId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/exam-prep/documents/${documentId}/read`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setDoc(data.document)
    } catch {
      toast.error('Impossible de charger le document')
      onClose()
    } finally {
      setLoading(false)
    }
  }, [documentId, onClose])

  useEffect(() => {
    if (documentId) {
      loadDoc()
    } else {
      setDoc(null)
    }
  }, [documentId, loadDoc])

  const handleDownload = async (format: 'txt' | 'pdf') => {
    if (!documentId) return
    setDownloading(true)
    try {
      const res = await fetch(`/api/exam-prep/documents/${documentId}/download?format=${format}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc ? `${doc.nomFichier.replace(/\.[^/.]+$/, '')}.${format}` : `document.${format}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Téléchargé (${format.toUpperCase()})`)
    } catch {
      toast.error('Échec du téléchargement')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <AnimatePresence>
      {documentId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300, duration: 0.25 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-4xl max-h-[90vh] bg-card rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="ds-kente-pattern shrink-0 px-6 py-4 border-b border-border">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                    <FileText className="h-5 w-5 text-primary-text" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-bold tracking-tight truncate">
                      {loading ? 'Chargement…' : doc?.nomFichier ?? 'Document'}
                    </h2>
                    {doc && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                        {doc.uniteEnseignement && (
                          <span className="flex items-center gap-1">
                            <BookOpen className="h-3 w-3" />
                            {doc.uniteEnseignement.code} — {doc.uniteEnseignement.nom}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {doc.owner.name}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(doc.dateUpload).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Taille de police */}
                  {doc && (
                    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-0.5">
                      <button
                        onClick={() => setFontSize((s) => Math.max(12, s - 1))}
                        className="h-7 w-7 rounded-md text-sm font-bold hover:bg-background transition-colors"
                        title="Réduire la police"
                      >A-</button>
                      <button
                        onClick={() => setFontSize((s) => Math.min(20, s + 1))}
                        className="h-7 w-7 rounded-md text-base font-bold hover:bg-background transition-colors"
                        title="Agrandir la police"
                      >A+</button>
                    </div>
                  )}
                  {/* Télécharger TXT */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload('txt')}
                    disabled={downloading || !doc}
                    className="gap-1.5"
                    title="Télécharger en TXT"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">TXT</span>
                  </Button>
                  {/* Télécharger PDF */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload('pdf')}
                    disabled={downloading || !doc}
                    className="gap-1.5"
                    title="Télécharger en PDF"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">PDF</span>
                  </Button>
                  {/* Fermer */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="h-9 w-9 p-0"
                    aria-label="Fermer"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Thèmes + résumé */}
              {doc && (doc.themesDetectes.length > 0 || doc.resumeAnalyse) && (
                <div className="mt-3 space-y-2">
                  {doc.resumeAnalyse && (
                    <p className="text-xs text-muted-foreground italic line-clamp-2">{doc.resumeAnalyse}</p>
                  )}
                  {doc.themesDetectes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {doc.themesDetectes.slice(0, 5).map((t, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] bg-primary/10 text-primary-text">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Zone de lecture */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : doc?.contenuTexte ? (
                <article
                  className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed text-foreground"
                  style={{ fontSize: `${fontSize}px`, lineHeight: 1.7 }}
                >
                  {doc.contenuTexte}
                </article>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-3 text-sm font-medium">Aucun contenu textuel disponible</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Le contenu n'a pas pu être extrait lors de l'analyse.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            {doc?.contenuTexte && (
              <div className="shrink-0 px-6 py-2 border-t border-border/50 bg-muted/20 text-center">
                <p className="text-[10px] text-muted-foreground">
                  {doc.contenuTexte.length.toLocaleString('fr-FR')} caractères · {doc.contenuTexte.split(/\s+/).length.toLocaleString('fr-FR')} mots
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
