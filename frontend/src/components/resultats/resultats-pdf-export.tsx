// ─────────────────────────────────────────────────────────────
// Bouton d'export PDF (côté client) pour la vue d'ensemble.
// BUGFIX (RESULTATS-PDF-404) : l'ancienne implémentation appelait
// `POST /api/resultats/export?format=pdf` qui n'existe pas côté backend
// (404 systématique). On génère désormais un PDF côté client via jsPDF,
// avec un en-tête Kente et les données réelles de l'overview.
// ─────────────────────────────────────────────────────────────

'use client'

import { useState } from 'react'
import { Download, Loader2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { formatDateShortFR } from '@/lib/resultats-utils'
import type { OverviewResponse } from '@/types/resultats'

interface ResultatsPDFExportProps {
  data: OverviewResponse | null | undefined
}

/**
 * ResultatsPDFExport — génère un PDF côté client (jsPDF + autotable)
 * contenant les KPIs globaux, le tableau des épreuves et la liste des
 * étudiants en difficulté. Aucune dépendance backend.
 */
export function ResultatsPDFExport({ data }: ResultatsPDFExportProps) {
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    if (!data) {
      toast.error('Aucune donnée disponible pour l\'export PDF')
      return
    }

    setIsExporting(true)
    try {
      // Import dynamique pour réduire le bundle côté serveur
      const [{ default: jsPDF }, autoTableMod] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ])
      const autoTable = (autoTableMod.default ?? autoTableMod) as (doc: unknown, options: unknown) => void

      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const now = new Date()

      // ─── Bandeau Kente (vert/terre/or) ───
      const stripeHeight = 6
      const stripeY = 0
      const w = pageWidth / 3
      doc.setFillColor(132, 204, 22) // vert lime
      doc.rect(0, stripeY, w, stripeHeight, 'F')
      doc.setFillColor(194, 65, 12) // terre cuite
      doc.rect(w, stripeY, w, stripeHeight, 'F')
      doc.setFillColor(212, 160, 23) // or
      doc.rect(2 * w, stripeY, w, stripeHeight, 'F')

      // ─── Titre ───
      doc.setTextColor(44, 62, 80) // bleu nuit
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(20)
      doc.text('Résultats & Analyses', 40, 50)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(107, 114, 128)
      doc.text(`Édité le ${formatDateShortFR(now)} à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, 40, 66)

      // ─── KPIs (4 cartes) ───
      const kpiY = 90
      const cardW = (pageWidth - 80 - 30) / 4
      const cardH = 60
      const kpis = [
        { label: 'Épreuves', value: String(data.totalEpreuves ?? 0), r: 132, g: 204, b: 22 },
        { label: 'Copies', value: String(data.totalSessions ?? 0), r: 194, g: 65, b: 12 },
        { label: 'Moyenne', value: `${(data.globalMoyenne ?? 0).toFixed(1)}/20`, r: 44, g: 62, b: 80 },
        { label: 'Réussite', value: `${(data.globalTauxReussite ?? 0).toFixed(1)}%`, r: 212, g: 160, b: 23 },
      ]
      kpis.forEach((kpi, i) => {
        const x = 40 + i * (cardW + 10)
        doc.setFillColor(245, 247, 250)
        doc.roundedRect(x, kpiY, cardW, cardH, 4, 4, 'F')
        doc.setDrawColor(kpi.r, kpi.g, kpi.b)
        doc.setLineWidth(2)
        doc.line(x, kpiY, x, kpiY + cardH)
        doc.setTextColor(107, 114, 128)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.text(kpi.label.toUpperCase(), x + 8, kpiY + 16)
        doc.setTextColor(kpi.r, kpi.g, kpi.b)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(16)
        doc.text(kpi.value, x + 8, kpiY + 42)
      })

      // ─── Tableau des épreuves ───
      let cursorY = kpiY + cardH + 24
      doc.setTextColor(44, 62, 80)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.text('Épreuves', 40, cursorY)
      cursorY += 6

      const epreuvesBody = (data.epreuves ?? []).map((e) => [
        e.titre.length > 50 ? e.titre.slice(0, 47) + '...' : e.titre,
        formatDateShortFR(e.dateFin || e.dateDebut),
        String(e.nbSessions ?? 0),
        `${e.nbCorrigees ?? 0}/${e.nbSessions ?? 0}`,
        (e.moyenne ?? 0).toFixed(1),
        `${(e.tauxReussite ?? 0).toFixed(1)}%`,
      ])

      autoTable(doc, {
        startY: cursorY,
        head: [['Épreuve', 'Date', 'Copies', 'Corrigées', 'Moy /20', 'Réussite']],
        body: epreuvesBody.length > 0 ? epreuvesBody : [['—', 'Aucune épreuve', '', '', '', '']],
        theme: 'striped',
        headStyles: { fillColor: [132, 204, 22], textColor: 255, fontSize: 9 },
        bodyStyles: { fontSize: 9, textColor: [44, 62, 80] },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 40, right: 40 },
        styles: { cellPadding: 5 },
      })

      // ─── Tableau des étudiants en difficulté ───
      // @ts-expect-error lastAutoTable est ajouté dynamiquement par le plugin
      cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 24
      if (cursorY > doc.internal.pageSize.getHeight() - 100) {
        doc.addPage()
        cursorY = 50
      }
      doc.setTextColor(44, 62, 80)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.text('Étudiants en difficulté (moyenne < 8/20)', 40, cursorY)
      cursorY += 6

      const riskBody = (data.studentsAtRisk ?? []).map((s, i) => [
        String(i + 1),
        s.etudiantName,
        s.etudiantEmail,
        String(s.nbExamens),
        (s.moyenne ?? 0).toFixed(1),
      ])

      autoTable(doc, {
        startY: cursorY,
        head: [['#', 'Étudiant', 'Email', 'Épreuves', 'Moy /20']],
        body: riskBody.length > 0 ? riskBody : [['—', 'Aucun étudiant en difficulté', '', '', '']],
        theme: 'striped',
        headStyles: { fillColor: [208, 2, 27], textColor: 255, fontSize: 9 },
        bodyStyles: { fontSize: 9, textColor: [44, 62, 80] },
        alternateRowStyles: { fillColor: [254, 242, 242] },
        margin: { left: 40, right: 40 },
        styles: { cellPadding: 5 },
      })

      // ─── Top questions difficiles ───
      // @ts-expect-error lastAutoTable est ajouté dynamiquement par le plugin
      cursorY = (doc.lastAutoTable?.finalY ?? cursorY) + 24
      if (cursorY > doc.internal.pageSize.getHeight() - 100) {
        doc.addPage()
        cursorY = 50
      }
      doc.setTextColor(44, 62, 80)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.text('Questions les plus difficiles', 40, cursorY)
      cursorY += 6

      const topQBody = (data.topQuestions ?? []).slice(0, 10).map((q, i) => [
        String(i + 1),
        q.type,
        q.epreuveTitre.length > 40 ? q.epreuveTitre.slice(0, 37) + '...' : q.epreuveTitre,
        (q.enonce ?? '').length > 60 ? (q.enonce ?? '').slice(0, 57) + '...' : (q.enonce ?? ''),
        `${(q.tauxReussite ?? 0).toFixed(1)}%`,
        String(q.count),
      ])

      autoTable(doc, {
        startY: cursorY,
        head: [['#', 'Type', 'Épreuve', 'Énoncé', 'Réussite', 'Rép.']],
        body: topQBody.length > 0 ? topQBody : [['—', 'Aucune question difficile', '', '', '', '']],
        theme: 'striped',
        headStyles: { fillColor: [212, 160, 23], textColor: 255, fontSize: 9 },
        bodyStyles: { fontSize: 9, textColor: [44, 62, 80] },
        alternateRowStyles: { fillColor: [253, 246, 230] },
        margin: { left: 40, right: 40 },
        styles: { cellPadding: 5 },
      })

      // ─── Pied de page sur chaque page ───
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        const h = doc.internal.pageSize.getHeight()
        doc.setDrawColor(224, 224, 224)
        doc.setLineWidth(0.5)
        doc.line(40, h - 30, pageWidth - 40, h - 30)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(107, 114, 128)
        doc.text('SECT — Savane EdTech', 40, h - 18)
        doc.text(`Page ${i} / ${pageCount}`, pageWidth - 40, h - 18, { align: 'right' })
      }

      const filename = `resultats_overview_${now.toISOString().slice(0, 10)}.pdf`
      doc.save(filename)
      toast.success('Export PDF généré', { description: filename })
    } catch (err) {
      console.error('[ResultatsPDFExport] error', err)
      toast.error("Erreur lors de l'export PDF", {
        description: 'Impossible de générer le PDF. Réessayez ou contactez l\'administrateur.',
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
      disabled={isExporting || !data}
      className="border-gold/40 bg-gold/5 text-gold hover:bg-gold/10 hover:text-gold focus-visible:ring-gold/40"
      aria-label="Exporter la vue d'ensemble en PDF"
    >
      {isExporting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="hidden sm:inline">Génération...</span>
        </>
      ) : (
        <>
          {data ? <Download className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          <span className="hidden sm:inline">PDF</span>
        </>
      )}
    </Button>
  )
}
