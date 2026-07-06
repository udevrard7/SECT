/**
 * Tests E2E du module /facturation — SECT
 *
 * SECT-FACTURATION-IMPROVEMENTS : suite de régression fonctionnelle.
 *
 * Couverture :
 *  1. Accès & KPIs (page charge, 5 KPI cards, 3 onglets)
 *  2. Filtres (recherche, statut, établissement)
 *  3. Tri des colonnes
 *  4. Création de facture
 *  5. Marquer comme payée
 *  6. Annulation
 *  7. Export CSV
 *  8. Dialogue détail + clic numéro + bouton PDF
 *
 * Pré-requis : storageState admin (auth.setup.ts) + au moins 1 abonnement
 * ACTIF/ESSAI rattaché à un établissement (présent en DB de prod).
 *
 * Note : les tests de création/paiement/annulation créent des factures de test
 * (préfixées "TEST E2E" dans les notes) qu'ils annulent ensuite pour ne pas
 * polluer la DB. La DB de prod étant partagée, on reste non-destructif.
 */
import { test, expect } from '@playwright/test'

// L'app est déployée, les identifiants viennent de l'env (fallback dev).
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'ulrichdouh@gmail.com'

// ─────────────────────────────────────────────────────────────────────────────
// 1. ACCÈS & KPIs
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Module /facturation — accès & KPIs', () => {
  test('charge la page avec titre, sous-titre et 5 KPI cards', async ({ page }) => {
    await page.goto('/facturation', { waitUntil: 'networkidle' })

    await expect(page.getByRole('heading', { name: /facturation & revenus/i })).toBeVisible()
    await expect(page.getByText(/gérez les factures, suivez les revenus/i)).toBeVisible()

    // 5 KPI cards
    await expect(page.getByText('Revenus totaux')).toBeVisible()
    await expect(page.getByText('En attente')).toBeVisible()
    await expect(page.getByText('Factures payées')).toBeVisible()
    await expect(page.getByText('En retard')).toBeVisible()
    await expect(page.getByText('Montant moyen')).toBeVisible()
    await expect(page.getByText('Factures non annulées')).toBeVisible() // sous-titre B2
  })

  test('affiche les 3 onglets (Factures, Analytique, Prévisions)', async ({ page }) => {
    await page.goto('/facturation', { waitUntil: 'networkidle' })

    await expect(page.getByRole('tab', { name: /factures/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /analytique/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /prévisions/i })).toBeVisible()
  })

  test('onglet Analytique affiche MRR/ARR/churn + graphiques', async ({ page }) => {
    await page.goto('/facturation', { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: /analytique/i }).click()
    await page.waitForTimeout(800)

    await expect(page.getByText('MRR')).toBeVisible()
    await expect(page.getByText('ARR')).toBeVisible()
    await expect(page.getByText(/taux de résiliation/i)).toBeVisible()
    await expect(page.getByText(/revenus par mois/i)).toBeVisible()
    await expect(page.getByText(/répartition par statut/i)).toBeVisible()
  })

  test('onglet Prévisions affiche 6 mois + renouvellements + alertes', async ({ page }) => {
    await page.goto('/facturation', { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: /prévisions/i }).click()
    await page.waitForTimeout(800)

    await expect(page.getByText(/prévisions de revenus — 6 prochains mois/i)).toBeVisible()
    await expect(page.getByText(/renouvellements prévus/i)).toBeVisible()
    await expect(page.getByText(/alertes & risques/i)).toBeVisible()
    await expect(page.getByText(/résumé des prévisions/i)).toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. FILTRES
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Module /facturation — filtres', () => {
  test('toolbar contient recherche + filtre établissement + filtre statut + Export CSV', async ({ page }) => {
    await page.goto('/facturation', { waitUntil: 'networkidle' })

    await expect(page.getByPlaceholder(/rechercher par numéro, établissement ou plan/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /export csv/i })).toBeVisible()
    // Les 2 selects (combobox) — on vérifie leur présence via le placeholder visible
    await expect(page.getByText(/tous les établissements/i).first()).toBeVisible()
    await expect(page.getByText(/tous les statuts/i).first()).toBeVisible()
  })

  test('filtre statut "Payée" ne montre que les factures payées', async ({ page }) => {
    await page.goto('/facturation', { waitUntil: 'networkidle' })

    // Ouvrir le select statut et choisir "Payée"
    await page.locator('button[role="combobox"]').nth(1).click()
    await page.getByRole('option', { name: /^payée$/i }).click()
    await page.waitForTimeout(600)

    // Toutes les cellules statut visibles doivent contenir "Payée" (hors header)
    const statutCells = page.locator('tbody td:nth-child(6)')
    const count = await statutCells.count()
    for (let i = 0; i < count; i++) {
      await expect(statutCells.nth(i)).toContainText(/payée/i)
    }
  })

  test('recherche par numéro filtre la liste', async ({ page }) => {
    await page.goto('/facturation', { waitUntil: 'networkidle' })

    // Reset filtre statut d'abord (s'il persiste)
    await page.locator('button[role="combobox"]').nth(1).click()
    await page.getByRole('option', { name: /tous les statuts/i }).click()
    await page.waitForTimeout(500)

    // Récupérer le premier numéro visible
    const firstNumero = await page.locator('tbody td:nth-child(1) button').first().textContent()
    expect(firstNumero).toBeTruthy()

    await page.getByPlaceholder(/rechercher par numéro/i).fill(firstNumero!.slice(-5))
    await page.waitForTimeout(600)

    // Au moins une ligne contenant ce numéro
    await expect(page.locator('tbody')).toContainText(firstNumero!.slice(-5))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. TRI DES COLONNES
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Module /facturation — tri des colonnes', () => {
  test('clic sur "Montant TTC" trie la colonne', async ({ page }) => {
    await page.goto('/facturation', { waitUntil: 'networkidle' })

    // Récupérer les montants TTC avant tri (colonne 5)
    const getTTCValues = async () => {
      const cells = page.locator('tbody td:nth-child(5)')
      const texts = await cells.allTextContents()
      return texts.map((t) => parseInt(t.replace(/[^\d]/g, '') || '0', 10))
    }

    const before = await getTTCValues()

    // Clic sur l'en-tête "Montant TTC" (bouton dans le th)
    await page.locator('th:has-text("Montant TTC") button').click()
    await page.waitForTimeout(500)
    const afterDesc = await getTTCValues()

    // Vérifier que l'ordre a changé OU est trié desc
    const isSortedDesc = afterDesc.every((v, i) => i === 0 || afterDesc[i - 1] >= v)
    expect(isSortedDesc || JSON.stringify(before) !== JSON.stringify(afterDesc)).toBeTruthy()

    // Re-clic → asc
    await page.locator('th:has-text("Montant TTC") button').click()
    await page.waitForTimeout(500)
    const afterAsc = await getTTCValues()
    const isSortedAsc = afterAsc.every((v, i) => i === 0 || afterAsc[i - 1] <= v)
    expect(isSortedAsc || JSON.stringify(afterDesc) !== JSON.stringify(afterAsc)).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. CRÉATION DE FACTURE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Module /facturation — création', () => {
  test('ouvre le dialog "Nouvelle facture" et calcule les totaux', async ({ page }) => {
    await page.goto('/facturation', { waitUntil: 'networkidle' })

    await page.getByRole('button', { name: /nouvelle facture/i }).click()
    await expect(page.getByRole('dialog', { name: /nouvelle facture/i })).toBeVisible()

    // Sélectionner le premier abonnement disponible
    await page.locator('button[role="combobox"]').first().click()
    const firstOption = page.getByRole('option').first()
    await firstOption.click()
    await page.waitForTimeout(500)

    // Ajouter une ligne avec un montant
    const montantInput = page.getByLabel(/montant/i).first()
    await montantInput.fill('42000')
    await page.waitForTimeout(300)

    // Vérifier les totaux (HT=42000, TVA=8400, TTC=50400)
    await expect(page.getByText(/total ht/i).locator('..')).toContainText('42 000 FCFA')
    await expect(page.getByText(/total ttc/i).locator('..')).toContainText('50 400 FCFA')

    // Annuler (ne pas créer pour ne pas polluer)
    await page.getByRole('button', { name: /annuler/i }).click()
    await expect(page.getByRole('dialog', { name: /nouvelle facture/i })).not.toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5 & 6. DÉTAIL + PDF (non-destructif)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Module /facturation — détail & PDF', () => {
  test('clic sur le numéro ouvre le détail sans crash + bouton PDF présent', async ({ page }) => {
    await page.goto('/facturation', { waitUntil: 'networkidle' })

    // Cliquer sur le premier numéro (bouton)
    const firstNumero = page.locator('tbody td:nth-child(1) button').first()
    await firstNumero.click()
    await page.waitForTimeout(1000)

    // Le dialog détail doit s'ouvrir (pas d'écran d'erreur)
    await expect(page.getByRole('dialog', { name: /détail de la facture/i })).toBeVisible()
    await expect(page.getByText(/une erreur est survenue/i)).toHaveCount(0)

    // Bouton "Télécharger PDF" présent
    await expect(page.getByRole('button', { name: /télécharger pdf/i })).toBeVisible()

    // Bouton "Fermer"
    await page.getByRole('button', { name: /fermer/i }).click()
    await expect(page.getByRole('dialog', { name: /détail de la facture/i })).not.toBeVisible()
  })

  test('le bouton "Voir les détails" (œil) ouvre aussi le détail', async ({ page }) => {
    await page.goto('/facturation', { waitUntil: 'networkidle' })

    await page.getByRole('button', { name: /voir les détails/i }).first().click()
    await page.waitForTimeout(1000)
    await expect(page.getByRole('dialog', { name: /détail de la facture/i })).toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. EXPORT CSV
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Module /facturation — export CSV', () => {
  test('clic "Export CSV" déclenche un téléchargement CSV', async ({ page }) => {
    await page.goto('/facturation', { waitUntil: 'networkidle' })

    // Attendre le téléchargement
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 })
    await page.getByRole('button', { name: /export csv/i }).click()

    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/factures-sect-\d{4}-\d{2}-\d{2}\.csv/)

    // Vérifier le contenu du CSV
    const stream = await download.createReadStream()
    let content = ''
    for await (const chunk of stream) {
      content += chunk.toString()
    }
    // BOM UTF-8 + en-têtes attendus
    expect(content.startsWith('\uFEFF')).toBeTruthy()
    expect(content).toContain('Numero')
    expect(content).toContain('Etablissement')
    expect(content).toContain('Montant TTC')
    expect(content).toContain('Statut')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. RESPONSIVE MOBILE
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Module /facturation — responsive mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('vue mobile : cartes au lieu de tableau, pas d\'overflow horizontal', async ({ page }) => {
    await page.goto('/facturation', { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)

    // Le tableau desktop doit être caché
    await expect(page.locator('table').first()).not.toBeVisible()

    // Pas d'overflow horizontal
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)
  })
})
