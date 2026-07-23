/**
 * facture-pdf.tsx — Facture PDF professionnelle (A4 portrait)
 *
 * SECT-FACTURATION-IMPROVEMENTS : génération PDF d'une facture individuelle.
 * Pattern identique à certificat-pdf-react.tsx (renderToBuffer, côté serveur).
 *
 * Layout :
 *  - Header : bandeau vert SECT + "FACTURE" + numéro
 *  - Émetteur (plateforme SECT) / Destinataire (établissement)
 *  - Bloc infos : numéro, dates émission/échéance/paiement, statut
 *  - Table des lignes (description + montant HT)
 *  - Totaux : HT, TVA (%), TTC
 *  - Paiement (si payée) : mode, référence, date
 *  - Notes (si présentes)
 *  - Footer : mention + code vérification
 *
 * Palette : emerald #059669 (success), text #1F2937, muted #6B7280, border #E5E7EB
 */
import React from 'react'
import {
  Document, Page, View, Text, Font, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer'
import path from 'path'

// ═══ Fonts ═══

const FONTS_DIR = path.join(process.cwd(), 'public', 'fonts')

Font.register({
  family: 'Inter',
  fonts: [
    { src: path.join(FONTS_DIR, 'Inter-Regular.ttf'), fontWeight: 'normal' },
    { src: path.join(FONTS_DIR, 'Inter-Regular.ttf'), fontWeight: 'bold' },
    { src: path.join(FONTS_DIR, 'Inter-Italic.ttf'), fontWeight: 'normal', fontStyle: 'italic' },
  ],
})

// ═══ Types ═══

export interface FactureLignePDF {
  description: string
  montant: number
}

export interface FacturePDFData {
  numero: string
  statut: string // EN_ATTENTE | PAYEE | EN_RETARD | ANNULEE
  dateEmission: string // ISO
  dateEcheance: string // ISO
  datePaiement: string | null // ISO
  modePaiement: string | null
  referencePaiement: string | null
  montantHt: number
  tva: number // pourcentage, ex 20
  montantTtc: number
  lignes: FactureLignePDF[]
  notes: string | null
  // Etablissement (destinataire)
  etablissementNom: string
  etablissementVille: string | null
  etablissementEmail: string | null
  etablissementPays: string | null
  etablissementTelephone: string | null
  etablissementAdresse: string | null
  // Abonnement/Plan
  planNom: string
  planType: string
  planPrixMensuel: number
}

// ═══ Constants ═══

const EMERALD = '#059669'
const EMERALD_DARK = '#047857'
const EMERALD_LIGHT = '#ECFDF5'
const TEXT_DARK = '#1F2937'
const TEXT_MUTED = '#6B7280'
const BORDER = '#E5E7EB'
const BG_ALT = '#F9FAFB'
const WHITE = '#FFFFFF'
const RED = '#DC2626'
const AMBER = '#D97706'

// ═══ Helpers ═══

function formatDate(date: string | null): string {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + ' FCFA'
}

function getStatutLabel(statut: string): string {
  switch (statut) {
    case 'EN_ATTENTE': return 'En attente'
    case 'PAYEE': return 'Payée'
    case 'EN_RETARD': return 'En retard'
    case 'ANNULEE': return 'Annulée'
    default: return statut
  }
}

function getStatutColor(statut: string): string {
  switch (statut) {
    case 'PAYEE': return EMERALD_DARK
    case 'EN_ATTENTE': return AMBER
    case 'EN_RETARD': return RED
    case 'ANNULEE': return TEXT_MUTED
    default: return TEXT_DARK
  }
}

// ═══ Styles ═══

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 10,
    color: TEXT_DARK,
    paddingTop: 0,
    paddingBottom: 40,
    paddingHorizontal: 0,
    backgroundColor: WHITE,
  },
  // Header bandeau
  header: {
    flexDirection: 'row',
    backgroundColor: EMERALD,
    paddingHorizontal: 40,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'column',
  },
  brandName: {
    fontFamily: 'Inter',
    fontWeight: 'bold',
    fontSize: 22,
    color: WHITE,
    letterSpacing: 2,
  },
  brandTagline: {
    fontSize: 8,
    color: EMERALD_LIGHT,
    marginTop: 2,
    letterSpacing: 1,
  },
  headerRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  factureTitle: {
    fontFamily: 'Inter',
    fontWeight: 'bold',
    fontSize: 26,
    color: WHITE,
    letterSpacing: 3,
  },
  factureNumero: {
    fontSize: 11,
    color: EMERALD_LIGHT,
    marginTop: 4,
    fontFamily: 'Inter',
  },
  // Body
  body: {
    paddingHorizontal: 40,
    paddingVertical: 24,
  },
  // Bloc émetteur/destinataire
  partiesRow: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 24,
  },
  partyBlock: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
    padding: 14,
  },
  partyLabel: {
    fontSize: 8,
    color: EMERALD_DARK,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  partyName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: TEXT_DARK,
    marginBottom: 4,
  },
  partyLine: {
    fontSize: 9,
    color: TEXT_MUTED,
    marginBottom: 2,
  },
  // Bloc infos facture
  infosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  infoCell: {
    width: '32%',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    padding: 10,
    backgroundColor: BG_ALT,
  },
  infoLabel: {
    fontSize: 7,
    color: TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 3,
  },
  infoValue: {
    fontSize: 11,
    fontWeight: 'bold',
    color: TEXT_DARK,
  },
  statutBadge: {
    fontSize: 11,
    fontWeight: 'bold',
    color: WHITE,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
  },
  // Table lignes
  tableLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: EMERALD_DARK,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  table: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: EMERALD,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tableHeaderCell: {
    color: WHITE,
    fontSize: 9,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRowAlt: {
    backgroundColor: BG_ALT,
  },
  tableCellDesc: {
    flex: 1,
    fontSize: 10,
    color: TEXT_DARK,
  },
  tableCellAmount: {
    width: 130,
    fontSize: 10,
    color: TEXT_DARK,
    textAlign: 'right',
    fontFamily: 'Inter',
  },
  // Totaux
  totalsBlock: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 20,
  },
  totalsTable: {
    width: 240,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  totalRowLabel: {
    fontSize: 10,
    color: TEXT_MUTED,
  },
  totalRowValue: {
    fontSize: 10,
    color: TEXT_DARK,
    fontWeight: 'bold',
  },
  totalRowFinal: {
    backgroundColor: EMERALD_LIGHT,
    borderBottomWidth: 0,
  },
  totalRowFinalLabel: {
    fontSize: 12,
    color: EMERALD_DARK,
    fontWeight: 'bold',
  },
  totalRowFinalValue: {
    fontSize: 14,
    color: EMERALD_DARK,
    fontWeight: 'bold',
  },
  // Paiement
  paiementBlock: {
    borderWidth: 1,
    borderColor: EMERALD,
    borderRadius: 4,
    padding: 14,
    backgroundColor: EMERALD_LIGHT,
    marginBottom: 16,
  },
  paiementTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: EMERALD_DARK,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  paiementRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  paiementLabel: {
    width: 140,
    fontSize: 9,
    color: TEXT_MUTED,
  },
  paiementValue: {
    flex: 1,
    fontSize: 9,
    color: TEXT_DARK,
    fontWeight: 'bold',
  },
  // Notes
  notesBlock: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    padding: 12,
    backgroundColor: BG_ALT,
    marginBottom: 16,
  },
  notesLabel: {
    fontSize: 8,
    color: TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 9,
    color: TEXT_DARK,
    fontStyle: 'italic',
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 7,
    color: TEXT_MUTED,
  },
  footerBrand: {
    fontSize: 7,
    color: EMERALD_DARK,
    fontWeight: 'bold',
  },
})

// ═══ Document ═══

function FactureDocument({ data }: { data: FacturePDFData }) {
  const statutColor = getStatutColor(data.statut)
  const isAnnulee = data.statut === 'ANNULEE'
  const isPayee = data.statut === 'PAYEE'

  return (
    <Document title={`Facture ${data.numero}`} author="SECT">
      <Page size="A4" style={styles.page}>
        {/* Header bandeau */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.brandName}>SECT</Text>
            <Text style={styles.brandTagline}>ÉVALUATION IA</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.factureTitle}>FACTURE</Text>
            <Text style={styles.factureNumero}>{data.numero}</Text>
          </View>
        </View>

        <View style={styles.body}>
          {/* Émetteur / Destinataire */}
          <View style={styles.partiesRow}>
            <View style={styles.partyBlock}>
              <Text style={styles.partyLabel}>Émetteur</Text>
              <Text style={styles.partyName}>SECT — Plateforme d'évaluation</Text>
              <Text style={styles.partyLine}>Système d'Évaluation Casse-Tête</Text>
              <Text style={styles.partyLine}>contact@sect.app</Text>
              <Text style={styles.partyLine}>www.sect-app.vercel.app</Text>
            </View>
            <View style={styles.partyBlock}>
              <Text style={styles.partyLabel}>Destinataire</Text>
              <Text style={styles.partyName}>{data.etablissementNom}</Text>
              {data.etablissementAdresse && (
                <Text style={styles.partyLine}>{data.etablissementAdresse}</Text>
              )}
              <Text style={styles.partyLine}>
                {data.etablissementVille ?? '—'}
                {data.etablissementPays ? `, ${data.etablissementPays}` : ''}
              </Text>
              {data.etablissementEmail && (
                <Text style={styles.partyLine}>{data.etablissementEmail}</Text>
              )}
              {data.etablissementTelephone && (
                <Text style={styles.partyLine}>{data.etablissementTelephone}</Text>
              )}
            </View>
          </View>

          {/* Infos facture */}
          <View style={styles.infosGrid}>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Numéro</Text>
              <Text style={styles.infoValue}>{data.numero}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Date d'émission</Text>
              <Text style={styles.infoValue}>{formatDate(data.dateEmission)}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Date d'échéance</Text>
              <Text style={styles.infoValue}>{formatDate(data.dateEcheance)}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Abonnement</Text>
              <Text style={styles.infoValue}>{data.planNom}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Statut</Text>
              <View style={[styles.statutBadge, { backgroundColor: statutColor }]}>
                <Text>{getStatutLabel(data.statut)}</Text>
              </View>
            </View>
            {isPayee && data.datePaiement && (
              <View style={styles.infoCell}>
                <Text style={styles.infoLabel}>Date de paiement</Text>
                <Text style={styles.infoValue}>{formatDate(data.datePaiement)}</Text>
              </View>
            )}
          </View>

          {/* Table des lignes */}
          <Text style={styles.tableLabel}>Détail de la facturation</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Description</Text>
              <Text style={[styles.tableHeaderCell, { width: 130, textAlign: 'right' }]}>Montant HT</Text>
            </View>
            {data.lignes.length === 0 ? (
              <View style={styles.tableRow}>
                <Text style={styles.tableCellDesc}>Aucune ligne détaillée</Text>
                <Text style={styles.tableCellAmount}>—</Text>
              </View>
            ) : (
              data.lignes.map((ligne, idx) => (
                <View key={idx} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
                  <Text style={styles.tableCellDesc}>{ligne.description}</Text>
                  <Text style={styles.tableCellAmount}>{formatCurrency(ligne.montant)}</Text>
                </View>
              ))
            )}
          </View>

          {/* Totaux */}
          <View style={styles.totalsBlock}>
            <View style={styles.totalsTable}>
              <View style={styles.totalRow}>
                <Text style={styles.totalRowLabel}>Total HT</Text>
                <Text style={styles.totalRowValue}>{formatCurrency(data.montantHt)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalRowLabel}>TVA ({data.tva}%)</Text>
                <Text style={styles.totalRowValue}>{formatCurrency(data.montantTtc - data.montantHt)}</Text>
              </View>
              <View style={[styles.totalRow, styles.totalRowFinal]}>
                <Text style={styles.totalRowFinalLabel}>Total TTC</Text>
                <Text style={styles.totalRowFinalValue}>{formatCurrency(data.montantTtc)}</Text>
              </View>
            </View>
          </View>

          {/* Bloc paiement (si payée) */}
          {isPayee && (
            <View style={styles.paiementBlock}>
              <Text style={styles.paiementTitle}>Informations de paiement</Text>
              <View style={styles.paiementRow}>
                <Text style={styles.paiementLabel}>Mode de paiement :</Text>
                <Text style={styles.paiementValue}>
                  {data.modePaiement
                    ? data.modePaiement.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
                    : '—'}
                </Text>
              </View>
              {data.referencePaiement && (
                <View style={styles.paiementRow}>
                  <Text style={styles.paiementLabel}>Référence :</Text>
                  <Text style={styles.paiementValue}>{data.referencePaiement}</Text>
                </View>
              )}
              <View style={styles.paiementRow}>
                <Text style={styles.paiementLabel}>Date de paiement :</Text>
                <Text style={styles.paiementValue}>{formatDate(data.datePaiement)}</Text>
              </View>
            </View>
          )}

          {/* Mention annulée */}
          {isAnnulee && (
            <View style={[styles.paiementBlock, { borderColor: RED, backgroundColor: '#FEE2E2' }]}>
              <Text style={[styles.paiementTitle, { color: RED }]}>Facture annulée</Text>
              <Text style={{ fontSize: 9, color: TEXT_DARK }}>
                Cette facture a été annulée et n'est plus exigible.
              </Text>
            </View>
          )}

          {/* Notes */}
          {data.notes && (
            <View style={styles.notesBlock}>
              <Text style={styles.notesLabel}>Notes</Text>
              <Text style={styles.notesText}>{data.notes}</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Facture générée le {formatDate(new Date().toISOString())} — SECT — Plateforme d'évaluation IA
          </Text>
          <Text style={styles.footerBrand}>www.sect-app.vercel.app</Text>
        </View>
      </Page>
    </Document>
  )
}

// ═══ Render ═══

export async function renderFacturePDF(data: FacturePDFData): Promise<Buffer> {
  return await renderToBuffer(<FactureDocument data={data} />)
}
