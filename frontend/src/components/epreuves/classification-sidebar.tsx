'use client'

import { useState } from 'react'
import {
  BookOpen,
  GraduationCap,
  Hash,
  Layers,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  type ClassificationTree,
  type SelectedPath,
  NIVEAU_LABELS,
} from './classification-types'

// ─── Props ───

interface ClassificationSidebarProps {
  tree: ClassificationTree
  onSelect: (path: SelectedPath) => void
  selectedPath: SelectedPath
}

// ─── Component ───

export function ClassificationSidebar({
  tree,
  onSelect,
  selectedPath,
}: ClassificationSidebarProps) {
  // Track which filieres and niveaux are expanded
  const [expandedFilieres, setExpandedFilieres] = useState<Set<string>>(
    new Set()
  )
  const [expandedNiveaux, setExpandedNiveaux] = useState<Set<string>>(
    new Set()
  )

  // Mobile panel toggle
  const [mobileOpen, setMobileOpen] = useState(false)

  const toggleFiliere = (filiereId: string) => {
    setExpandedFilieres((prev) => {
      const next = new Set(prev)
      if (next.has(filiereId)) next.delete(filiereId)
      else next.add(filiereId)
      return next
    })
  }

  const toggleNiveau = (key: string) => {
    setExpandedNiveaux((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const isFiliereSelected = (filiereId: string) =>
    selectedPath.filiereId === filiereId && !selectedPath.niveau && !selectedPath.uniteId

  const isNiveauSelected = (filiereId: string, niveau: string) =>
    selectedPath.filiereId === filiereId &&
    selectedPath.niveau === niveau &&
    !selectedPath.uniteId

  const isUniteSelected = (uniteId: string) =>
    selectedPath.uniteId === uniteId

  const isNonClasseesSelected =
    selectedPath.filiereId === '__non_classees__' &&
    !selectedPath.niveau &&
    !selectedPath.uniteId

  const handleSelectFiliere = (filiereId: string) => {
    onSelect({ filiereId })
  }

  const handleSelectNiveau = (filiereId: string, niveau: string) => {
    onSelect({ filiereId, niveau })
  }

  const handleSelectUnite = (
    filiereId: string,
    niveau: string,
    uniteId: string
  ) => {
    onSelect({ filiereId, niveau, uniteId })
  }

  const handleSelectNonClassees = () => {
    onSelect({ filiereId: '__non_classees__' })
  }

  // ─── Tree node rendering ───

  const renderFiliereNode = (
    filiere: ClassificationTree['filieres'][0]
  ) => {
    const isExpanded = expandedFilieres.has(filiere.id)
    const isSelected = isFiliereSelected(filiere.id)

    return (
      <Collapsible
        key={filiere.id}
        open={isExpanded}
        onOpenChange={() => toggleFiliere(filiere.id)}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/30 ${
              isSelected
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'text-foreground'
            }`}
            onClick={() => handleSelectFiliere(filiere.id)}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <BookOpen className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="truncate font-medium">{filiere.nom}</span>
            {filiere.code && (
              <span className="shrink-0 text-xs text-muted-foreground">
                ({filiere.code})
              </span>
            )}
            <Badge
              variant="secondary"
              className="ml-auto shrink-0 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 text-[10px] px-1.5 py-0"
            >
              {filiere.count}
            </Badge>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="ml-4 border-l-2 border-emerald-200 dark:border-emerald-800 pl-2">
          {filiere.niveaux.map((niveauNode) =>
            renderNiveauNode(filiere.id, niveauNode)
          )}
        </CollapsibleContent>
      </Collapsible>
    )
  }

  const renderNiveauNode = (
    filiereId: string,
    niveauNode: ClassificationTree['filieres'][0]['niveaux'][0]
  ) => {
    const key = `${filiereId}-${niveauNode.niveau}`
    const isExpanded = expandedNiveaux.has(key)
    const isSelected = isNiveauSelected(filiereId, niveauNode.niveau)
    const label =
      NIVEAU_LABELS[niveauNode.niveau] || niveauNode.niveau

    return (
      <Collapsible
        key={key}
        open={isExpanded}
        onOpenChange={() => toggleNiveau(key)}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-teal-50 dark:hover:bg-teal-950/30 ${
              isSelected
                ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300'
                : 'text-foreground'
            }`}
            onClick={() => handleSelectNiveau(filiereId, niveauNode.niveau)}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <GraduationCap className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
            <span className="truncate">{label}</span>
            <Badge
              variant="secondary"
              className="ml-auto shrink-0 bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300 text-[10px] px-1.5 py-0"
            >
              {niveauNode.count}
            </Badge>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="ml-4 border-l-2 border-teal-200 dark:border-teal-800 pl-2">
          {niveauNode.unites.map((unite) => renderUniteNode(filiereId, niveauNode.niveau, unite))}
        </CollapsibleContent>
      </Collapsible>
    )
  }

  const renderUniteNode = (
    filiereId: string,
    niveau: string,
    unite: ClassificationTree['filieres'][0]['niveaux'][0]['unites'][0]
  ) => {
    const isSelected = isUniteSelected(unite.id)

    return (
      <button
        key={unite.id}
        type="button"
        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/30 ${
          isSelected
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
            : 'text-foreground'
        }`}
        onClick={() => handleSelectUnite(filiereId, niveau, unite.id)}
      >
        <Hash className="h-3.5 w-3.5 shrink-0 text-emerald-500 dark:text-emerald-400" />
        <span className="truncate">
          {unite.code} — {unite.nom}
        </span>
        <Badge
          variant="secondary"
          className="ml-auto shrink-0 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 text-[10px] px-1.5 py-0"
        >
          {unite.count}
        </Badge>
      </button>
    )
  }

  // ─── Sidebar content ───

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3">
        <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <h3 className="text-sm font-semibold">Classification</h3>
      </div>
      <Separator />

      {/* Tree */}
      <ScrollArea className="flex-1 px-2 py-2">
        <div className="space-y-0.5">
          {tree.filieres.map((filiere) => renderFiliereNode(filiere))}

          {/* Non classées */}
          {tree.nonClassees > 0 && (
            <>
              <Separator className="my-2" />
              <button
                type="button"
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-amber-50 dark:hover:bg-amber-950/30 ${
                  isNonClasseesSelected
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                    : 'text-foreground'
                }`}
                onClick={handleSelectNonClassees}
              >
                <FolderOpen className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="truncate font-medium">Non classées</span>
                <Badge
                  variant="secondary"
                  className="ml-auto shrink-0 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 text-[10px] px-1.5 py-0"
                >
                  {tree.nonClassees}
                </Badge>
              </button>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )

  // ─── Responsive: mobile collapsible panel, desktop sidebar ───

  return (
    <>
      {/* Mobile toggle button */}
      <div className="lg:hidden">
        <Button
          variant="outline"
          size="sm"
          className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
          Classification
        </Button>

        {/* Mobile panel */}
        {mobileOpen && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-card dark:border-emerald-900">
            <div className="max-h-80 overflow-y-auto">{sidebarContent}</div>
          </div>
        )}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <div className="sticky top-6 w-64 shrink-0 rounded-xl border border-emerald-200 bg-card dark:border-emerald-900">
          {sidebarContent}
        </div>
      </div>
    </>
  )
}
