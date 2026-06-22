'use client'

/**
 * CertificateGenerator.tsx — Client-side PDF generation with pdf-lib + html2canvas
 *
 * Replaces the @react-pdf/renderer server-side approach.
 * Flow: html2canvas captures the HTML preview (SVG bg + text) → png → pdf-lib
 * creates A4 PDF (landscape or portrait) → download.
 *
 * The SVG background preserves complex gradients/shadows that react-pdf can't render.
 */

import React, { useRef, useState, useCallback } from 'react'
import html2canvas from 'html2canvas'
import { PDFDocument } from 'pdf-lib'
import { Button } from '@/components/ui/button'
import { Loader2, Download, Maximize2, Minimize2 } from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ───

interface CertificateData {
  codeVerification: string
  type: string
  intitule: string
  mention: string | null
  noteFinale: number
  etablissementNom: string
  etablissementVille: string | null
  etablissementPays: string | null
  filiereNom: string
  ueCode: string
  ueNom: string
  etudiantNom: string
  etudiantMatricule: string | null
  etudiantNiveau: string | null
  sessionType: string
  anneeAcademique: string | null
  dateEmission: string
  verificationUrl: string
  responsableNom: string | null
}

// ─── Helpers ───

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatNote(note: number): string {
  return note % 1 === 0 ? note.toFixed(0) : note.toFixed(2)
}

function capitalizeName(name: string): string {
  return name.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

function getSubtitle(type: string): string {
  if (type === 'EXPERT') return 'Niveau Expert'
  if (type === 'AVANCE') return 'Niveau Avancé'
  return 'Niveau Standard'
}

function getSessionLabel(sessionType: string): string {
  return sessionType === 'RATTRAPAGE' ? 'Rattrapage' : 'Normale'
}

function base64ToUint8Array(base64DataUrl: string): Uint8Array {
  const base64Content = base64DataUrl.split(',')[1]
  const binaryString = atob(base64Content)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

// ─── Color tokens (adapted to the new SVG template: royal blue + gold) ───

const GOLD = '#D4AF37'       // Or métallisé (matching the SVG's gold frame)
const ROYAL_BLUE = '#1a3a6b' // Bleu royal (matching the SVG's outer frame)
const NAVY = '#1a3a6b'       // Same as royal blue for consistency
const TEXT_DARK = '#2C3E50'   // Gris foncé pour les titres
const TEXT_GRAY = '#7F8C8D'   // Gris pour texte secondaire
const GOLD_LIGHT = '#FFF8E1'  // Or très pâle pour les cellules mises en valeur
const GOLD_BORDER = '#E6C84E' // Bordure dorée des cellules

// ─── Component ───

interface Props {
  data: CertificateData
  onClose?: () => void
}

export function CertificateGenerator({ data, onClose }: Props) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [generating, setGenerating] = useState(false)
  const [isLandscape, setIsLandscape] = useState(true)

  // ─── PDF Generation (html2canvas + pdf-lib) ───
  const handleDownload = useCallback(async () => {
    if (!previewRef.current) return
    setGenerating(true)
    try {
      // Step 1: html2canvas captures the preview at scale 3 (≈300 DPI)
      const canvas = await html2canvas(previewRef.current, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
      })

      // Step 2: Convert canvas to PNG bytes
      const pngDataUrl = canvas.toDataURL('image/png')
      const pngBytes = base64ToUint8Array(pngDataUrl)

      // Step 3: pdf-lib creates A4 PDF
      const pdfDoc = await PDFDocument.create()
      const pageWidth = isLandscape ? 841.89 : 595.28
      const pageHeight = isLandscape ? 595.28 : 841.89
      const page = pdfDoc.addPage([pageWidth, pageHeight])

      // Step 4: Embed PNG and draw full-page
      const embeddedPng = await pdfDoc.embedPng(pngBytes)
      page.drawImage(embeddedPng, { x: 0, y: 0, width: pageWidth, height: pageHeight })

      // Step 5: Save and download
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const safeName = capitalizeName(data.etudiantNom).replace(/\s+/g, '_')
      link.href = url
      link.download = `Certificat_${safeName}_${data.codeVerification}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success('Certificat téléchargé avec succès')
    } catch (err) {
      console.error('Certificate generation error:', err)
      toast.error('Erreur lors de la génération du PDF', {
        description: err instanceof Error ? err.message : 'Erreur inconnue',
      })
    } finally {
      setGenerating(false)
    }
  }, [data, isLandscape])

  // ─── Computed ───
  const studentName = capitalizeName(data.etudiantNom)
  const subtitle = getSubtitle(data.type)
  const sessionLabel = getSessionLabel(data.sessionType)
  const location = [data.etablissementVille, data.etablissementPays].filter(Boolean).join(', ')
  const studentParts: string[] = []
  if (data.etudiantMatricule) studentParts.push(`Matricule : ${data.etudiantMatricule}`)
  if (data.etudiantNiveau) studentParts.push(`Niveau : ${data.etudiantNiveau}`)

  // Dimensions CSS pour A4 selon le format
  const certWidth = isLandscape ? '1122px' : '793px'
  const certHeight = isLandscape ? '793px' : '1122px'

  // Info grid data
  const infos = [
    { label: 'CODE UE', value: data.ueCode, highlight: false },
    { label: 'FILIÈRE', value: data.filiereNom, highlight: false },
    { label: 'NOTE', value: `${formatNote(data.noteFinale)}/20`, highlight: true },
    { label: 'MENTION', value: data.mention || '—', highlight: true },
    { label: 'SESSION', value: sessionLabel, highlight: false },
    { label: 'ANNÉE', value: data.anneeAcademique || '—', highlight: false },
  ]

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Controls bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Format toggle */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
          <button
            onClick={() => setIsLandscape(true)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              isLandscape ? 'bg-background shadow-sm text-emerald-600' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            📐 Paysage
          </button>
          <button
            onClick={() => setIsLandscape(false)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              !isLandscape ? 'bg-background shadow-sm text-emerald-600' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            📄 Portrait
          </button>
        </div>

        <Button onClick={handleDownload} disabled={generating} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Génération en cours...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Télécharger le PDF
            </>
          )}
        </Button>

        {onClose && (
          <Button variant="ghost" onClick={onClose}>
            Fermer
          </Button>
        )}
      </div>

      {/* ─── Off-screen render area (captured by html2canvas) ─── */}
      <div style={{ position: 'absolute', left: '-9999px', top: '0' }}>
        <div
          ref={previewRef}
          style={{
            width: certWidth,
            height: certHeight,
            position: 'relative',
            backgroundColor: '#ffffff',
            overflow: 'hidden',
          }}
        >
          {/* Layer 1: SVG background */}
          <img
            src="/certificate-bg-landscape.svg"
            alt=""
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              zIndex: 1,
            }}
          />

          {/* Layer 2: Text overlay */}
          <div
            style={{
              position: 'relative',
              zIndex: 2,
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: isLandscape ? '60px 100px' : '70px 70px',
              boxSizing: 'border-box',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
              <p style={{ fontSize: '11px', color: GOLD, letterSpacing: '3px', fontWeight: 600, margin: 0 }}>
                {data.etablissementNom.toUpperCase()}
              </p>
              {location && (
                <p style={{ fontSize: '9px', color: TEXT_GRAY, margin: '2px 0 0 0' }}>{location}</p>
              )}
            </div>

            {/* Title */}
            <h1
              style={{
                fontFamily: 'Georgia, serif',
                fontSize: isLandscape ? '38px' : '36px',
                color: GOLD,
                letterSpacing: '4px',
                margin: '4px 0 2px 0',
                fontWeight: 700,
              }}
            >
              CERTIFICAT DE RÉUSSITE
            </h1>
            <p
              style={{
                fontFamily: 'Georgia, serif',
                fontSize: '22px',
                color: TEXT_DARK,
                letterSpacing: '2px',
                margin: '0 0 10px 0',
              }}
            >
              {subtitle}
            </p>

            {/* Diamonds */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ width: '8px', height: '8px', backgroundColor: GOLD, transform: 'rotate(45deg)' }} />
              <div style={{ width: '10px', height: '10px', backgroundColor: NAVY, transform: 'rotate(45deg)' }} />
              <div style={{ width: '8px', height: '8px', backgroundColor: GOLD, transform: 'rotate(45deg)' }} />
            </div>

            {/* Intro */}
            <p style={{ fontSize: '13px', color: TEXT_DARK, fontStyle: 'italic', margin: '0 0 6px 0' }}>
              Nous certifions par la présente que
            </p>

            {/* Student name */}
            <p
              style={{
                fontFamily: '"Brush Script MT", "Lucida Handwriting", cursive',
                fontSize: isLandscape ? '52px' : '48px',
                color: '#1A1A1A',
                margin: '0 0 4px 0',
                lineHeight: 1.2,
              }}
            >
              {studentName}
            </p>

            {/* Student info */}
            {studentParts.length > 0 && (
              <p style={{ fontSize: '10px', color: TEXT_GRAY, margin: '0 0 10px 0' }}>
                {studentParts.join('  •  ')}
              </p>
            )}

            {/* UE */}
            <p style={{ fontSize: '12px', color: TEXT_DARK, margin: '0 0 4px 0' }}>
              a validé avec succès l&apos;unité d&apos;enseignement
            </p>
            <p
              style={{
                fontFamily: 'Georgia, serif',
                fontSize: isLandscape ? '28px' : '26px',
                color: GOLD,
                fontWeight: 700,
                margin: '0 0 15px 0',
              }}
            >
              {data.ueNom}
            </p>

            {/* Info grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isLandscape ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
                gap: '8px',
                width: isLandscape ? '70%' : '85%',
                marginBottom: '15px',
              }}
            >
              {infos.map((info, i) => (
                <div
                  key={i}
                  style={{
                    textAlign: 'center',
                    padding: '8px',
                    borderRadius: '4px',
                    backgroundColor: info.highlight ? GOLD_LIGHT : '#F7FAFC',
                    border: info.highlight ? `1px solid ${GOLD_BORDER}` : 'none',
                  }}
                >
                  <p
                    style={{
                      fontSize: '8px',
                      color: TEXT_GRAY,
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      fontWeight: 600,
                      margin: '0 0 3px 0',
                    }}
                  >
                    {info.label}
                  </p>
                  <p style={{ fontSize: '12px', color: NAVY, fontWeight: 700, margin: 0 }}>
                    {info.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Badge */}
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                backgroundColor: NAVY,
                border: `3px solid ${GOLD}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '15px',
              }}
            >
              <span style={{ fontSize: '10px', color: '#FFFFFF', fontWeight: 700 }}>SECT</span>
              <span style={{ fontSize: '5px', color: GOLD, fontWeight: 700 }}>CERTIFIÉ</span>
            </div>

            {/* Signatures */}
            {isLandscape ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%', padding: '0 40px' }}>
                <div style={{ textAlign: 'center', width: '30%' }}>
                  <div style={{ height: '40px' }} />
                  <div style={{ borderBottom: `1px solid ${GOLD}`, marginBottom: '4px' }} />
                  <p style={{ fontSize: '9px', color: TEXT_GRAY, margin: 0 }}>Signature de l&apos;enseignant</p>
                </div>
                <div style={{ textAlign: 'center', width: '30%' }}>
                  <div style={{ height: '40px' }} />
                  <div style={{ borderBottom: `1px solid ${GOLD}`, marginBottom: '4px' }} />
                  {data.responsableNom && (
                    <p style={{ fontSize: '10px', color: '#2D3748', fontWeight: 700, margin: 0 }}>{data.responsableNom}</p>
                  )}
                  <p style={{ fontSize: '9px', color: TEXT_GRAY, margin: 0 }}>Le Responsable pédagogique</p>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '20px' }}>
                <div style={{ textAlign: 'center', width: '60%' }}>
                  <div style={{ height: '40px' }} />
                  <div style={{ borderBottom: `1px solid ${GOLD}`, marginBottom: '4px' }} />
                  <p style={{ fontSize: '9px', color: TEXT_GRAY, margin: 0 }}>Signature de l&apos;enseignant</p>
                </div>
                <div style={{ textAlign: 'center', width: '60%' }}>
                  <div style={{ height: '40px' }} />
                  <div style={{ borderBottom: `1px solid ${GOLD}`, marginBottom: '4px' }} />
                  {data.responsableNom && (
                    <p style={{ fontSize: '10px', color: '#2D3748', fontWeight: 700, margin: 0 }}>{data.responsableNom}</p>
                  )}
                  <p style={{ fontSize: '9px', color: TEXT_GRAY, margin: 0 }}>Le Responsable pédagogique</p>
                </div>
              </div>
            )}

            {/* Footer */}
            <div
              style={{
                position: 'absolute',
                bottom: '20px',
                left: '40px',
                right: '40px',
                textAlign: 'center',
                paddingTop: '8px',
                borderTop: `1px solid ${GOLD}`,
              }}
            >
              <p style={{ fontSize: '8px', color: '#4A5568', margin: 0 }}>
                Émis le {formatDate(data.dateEmission)}  |  Code: {data.codeVerification}  |  Vérification: {data.verificationUrl}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── On-screen preview (scaled down) ─── */}
      <div className="border rounded-lg overflow-hidden shadow-lg bg-white">
        <p className="text-xs text-muted-foreground text-center py-2 bg-muted/50">
          Aperçu ({isLandscape ? 'Paysage' : 'Portrait'})
        </p>
        <div
          style={{
            transform: 'scale(0.35)',
            transformOrigin: 'top left',
            width: certWidth,
            height: certHeight,
            position: 'relative',
            backgroundColor: '#fff',
            overflow: 'hidden',
          }}
        >
          <img
            src="/certificate-bg-landscape.svg"
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <div
            style={{
              position: 'relative',
              zIndex: 2,
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Inter, sans-serif',
              color: NAVY,
            }}
          >
            <p style={{ fontFamily: 'Georgia, serif', fontSize: '32px', color: GOLD, letterSpacing: '4px', fontWeight: 700 }}>
              CERTIFICAT DE RÉUSSITE
            </p>
            <p style={{ fontSize: '18px', color: TEXT_DARK }}>{subtitle}</p>
            <div style={{ display: 'flex', gap: '12px', margin: '10px 0' }}>
              <div style={{ width: '8px', height: '8px', backgroundColor: GOLD, transform: 'rotate(45deg)' }} />
              <div style={{ width: '10px', height: '10px', backgroundColor: NAVY, transform: 'rotate(45deg)' }} />
              <div style={{ width: '8px', height: '8px', backgroundColor: GOLD, transform: 'rotate(45deg)' }} />
            </div>
            <p style={{ fontStyle: 'italic', color: TEXT_DARK, fontSize: '14px' }}>Nous certifions par la présente que</p>
            <p style={{ fontFamily: '"Brush Script MT", cursive', fontSize: '52px', color: '#1A1A1A', margin: '5px 0' }}>
              {studentName}
            </p>
            <p style={{ fontSize: '13px', color: TEXT_DARK }}>a validé avec succès l&apos;unité d&apos;enseignement</p>
            <p style={{ fontFamily: 'Georgia, serif', fontSize: '28px', color: GOLD, fontWeight: 700 }}>{data.ueNom}</p>
            <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div
                style={{
                  width: '50px', height: '50px', borderRadius: '50%',
                  backgroundColor: NAVY, border: `3px solid ${GOLD}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column',
                }}
              >
                <span style={{ fontSize: '9px', color: '#fff', fontWeight: 700 }}>SECT</span>
                <span style={{ fontSize: '4px', color: GOLD, fontWeight: 700 }}>CERTIFIÉ</span>
              </div>
            </div>
            <p style={{ position: 'absolute', bottom: '15px', fontSize: '7px', color: TEXT_GRAY }}>
              {data.codeVerification} | {formatDate(data.dateEmission)}
            </p>
          </div>
        </div>
        {/* Spacer to hold the scaled-down preview height */}
        <div style={{ width: isLandscape ? '393px' : '278px', height: isLandscape ? '278px' : '393px' }} />
      </div>
    </div>
  )
}
