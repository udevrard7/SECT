'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { OverviewResponse } from '@/types/resultats'

/**
 * ResultatsPDFExport  Bouton d'export PDF pour les résultats.
 *
 * Utilise l'API backend `/api/epreuves/{id}/export?format=pdf` si disponible.
 * Sinon, affiche un message indiquant que la fonctionnalité est en cours de développement.
 *
 * @example
 * ```tsx
 * <ResultatsPDFExport data={overview} />
 * ```
 */
export function ResultatsPDFExport({ data }: { data: OverviewResponse | null | undefined }) {
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    if (!data) {
      toast.error('Aucune donnée disponible pour l\'export PDF')
      return
    }

    setIsExporting(true)
    try {
      // Essayer d'abord l'API backend pour l'export PDF global
      // Note: Cette route peut ne pas exister encore dans le backend.
      // Si elle échoue, on propose une alternative.
      const res = await fetch('/api/resultats/export?format=pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalEpreuves: data.totalEpreuves,
          totalSessions: data.totalSessions,
          globalMoyenne: data.globalMoyenne,
          globalTauxReussite: data.globalTauxReussite,
        }),
      })

      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `resultats_${new Date().toISOString().slice(0, 10)}.pdf`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        toast.success('Export PDF réussi')
      } else {
        // Alternative: Générer un PDF côté client avec les données disponibles
        // Pour l'instant, on affiche un message
        throw new Error('API non disponible')
      }
    } catch (error) {
      toast.error('Export PDF indisponible', {
        description: 'Cette fonctionnalité nécessite une configuration backend. Contactez l\'administrateur.',
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isExporting}
      className="border-gold/30 bg-gold/5 hover:bg-gold/10 text-gold hover:text-gold"
    >
      {isExporting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="hidden sm:inline">Génération...</span>
        </>
      ) : (
        <>
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">PDF</span>
        </>
      )}
    </Button>
  )
}
