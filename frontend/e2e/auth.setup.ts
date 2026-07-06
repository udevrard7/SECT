/**
 * Setup : login admin + sauvegarde du storageState pour les tests E2E.
 *
 * SECT-FACTURATION-IMPROVEMENTS : authentification partagée.
 *
 * Credentials : lus depuis env (ADMIN_EMAIL / ADMIN_PASSWORD) pour ne jamais
 * les hardcoder. En local, on peut créer un .env.local ou les exporter.
 *
 * Sortie : e2e/.auth/admin.json (cookies access_token/refresh + localStorage auth-store)
 */
import { test as setup, expect } from '@playwright/test'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'ulrichdouh@gmail.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin2025!'

setup('authenticate as admin', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'networkidle' })

  // Vérifier qu'on est bien sur la page de login
  await expect(page.getByRole('heading', { name: /bon retour/i })).toBeVisible()

  // L'onglet "Personnel" est sélectionné par défaut
  await page.getByPlaceholder(/adresse email/i).fill(ADMIN_EMAIL)
  await page.getByPlaceholder(/mot de passe/i).fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: /se connecter/i }).click()

  // Attendre la redirection vers /dashboard
  await page.waitForURL('**/dashboard', { timeout: 30_000 })
  await expect(page).toHaveURL(/\/dashboard/)

  // Sauvegarder l'état (cookies httpOnly + localStorage)
  await page.context().storageState({ path: 'e2e/.auth/admin.json' })
})
