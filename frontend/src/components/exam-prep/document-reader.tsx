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
 *
 * HIGHLIGHT-FLASHCARD-1 : sélection de texte → menu contextuel flottant avec
 * deux actions :
 *   1. "Créer une Flashcard" → POST /api/exam-prep/flashcards (IA génère Q/R)
 *   2. "Explique-moi ce passage" → onExplainPassage(text) bascule sur l'onglet
 *      Q&A et pré-remplit la question avec le passage sélectionné.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Download, Loader2, FileText, BookOpen, User, Calendar,
  Sparkles, MessageCircle,
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
  /** HIGHLIGHT-FLASHCARD-1 : callback "Explique-moi ce passage" → bascule onglet Q&A + préfill. */
  onExplainPassage?: (text: string, documentId: string) => void
}

interface SelectionMenu {
  text: string
  x: number
  y: number
}

export function DocumentReader({ documentId, onClose, onExplainPassage }: Props) {
  const [doc, setDoc] = useState<ReaderDocument | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [fontSize, setFontSize] = useState(14)
  const [creatingFlashcard, setCreatingFlashcard] = useState(false)
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenu | null>(null)

  const articleRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

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

  // ─── Détection de sélection de texte ───
  // HIGHLIGHT-FLASHCARD-1 : on écoute mouseup dans la zone de lecture.
  // Si la sélection est non vide et > 10 caractères, on affiche le menu
  // flottant positionné au-dessus de la sélection.
  const handleSelectionChange = useCallback(() => {
    if (creatingFlashcard) return
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      setSelectionMenu(null)
      return
    }
    const text = selection.toString().trim()
    if (text.length < 10) {
      setSelectionMenu(null)
      return
    }
    // Vérifier que la sélection est dans la zone de lecture (article).
    const range = selection.getRangeAt(0)
    const article = articleRef.current
    if (!article || !article.contains(range.commonAncestorContainer)) {
      setSelectionMenu(null)
      return
    }
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) {
      setSelectionMenu(null)
      return
    }
    // Positionne le menu au-dessus du rectangle de sélection.
    setSelectionMenu({
      text,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    })
  }, [creatingFlashcard])

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [handleSelectionChange])

  // Fermer le menu sur clic extérieur ou Escape.
  useEffect(() => {
    if (!selectionMenu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setSelectionMenu(null)
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectionMenu(null)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [selectionMenu])

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges()
    setSelectionMenu(null)
  }, [])

  const handleCreateFlashcard = async () => {
    if (!documentId || !selectionMenu) return
    setCreatingFlashcard(true)
    const selectedText = selectionMenu.text
    try {
      const res = await fetch('/api/exam-prep/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, selectedText }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Échec de la création')
      }
      const data = await res.json()
      const fc = data.flashcard
      toast.success('Flashcard créée', {
        description: fc?.recto ? fc.recto.slice(0, 80) + (fc.recto.length > 80 ? '…' : '') : undefined,
      })
      clearSelection()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de la création de la flashcard')
    } finally {
      setCreatingFlashcard(false)
    }
  }

  const handleExplainPassage = () => {
    if (!documentId || !selectionMenu || !onExplainPassage) return
    onExplainPassage(selectionMenu.text, documentId)
    clearSelection()
  }

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
                <>
                  {/* Hint HIGHLIGHT-FLASHCARD-1 */}
                  <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary-text flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                    <span>Sélectionnez un passage pour créer une flashcard ou demander une explication.</span>
                  </div>
                  <article
                    ref={articleRef}
                    className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed text-foreground"
                    style={{ fontSize: `${fontSize}px`, lineHeight: 1.7 }}
                  >
                    {doc.contenuTexte}
                  </article>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-3 text-sm font-medium">Aucun contenu textuel disponible</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Le contenu n&apos;a pas pu être extrait lors de l&apos;analyse.
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

          {/* Menu contextuel flottant (HIGHLIGHT-FLASHCARD-1) */}
          <AnimatePresence>
            {selectionMenu && (
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                style={{
                  position: 'fixed',
                  left: selectionMenu.x,
                  top: selectionMenu.y,
                  transform: 'translate(-50%, -100%)',
                  zIndex: 60,
                }}
                className="flex items-center gap-1 rounded-xl border border-border bg-card shadow-xl p-1"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCreateFlashcard}
                  disabled={creatingFlashcard}
                  className="gap-1.5 h-8 text-xs"
                  title="Générer une flashcard Q/R via l'IA"
                >
                  {creatingFlashcard ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-primary-text" />
                  )}
                  <span className="hidden sm:inline">Créer une Flashcard</span>
                  <span className="sm:hidden">Flashcard</span>
                </Button>
                <div className="w-px h-5 bg-border/60" />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleExplainPassage}
                  disabled={!onExplainPassage}
                  className="gap-1.5 h-8 text-xs"
                  title="Ouvrir l'onglet Questions au cours avec ce passage pré-rempli"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-info" />
                  <span className="hidden sm:inline">Explique-moi ce passage</span>
                  <span className="sm:hidden">Expliquer</span>
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
