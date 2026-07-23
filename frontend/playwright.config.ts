/**
 * Playwright config — Tests E2E du module /facturation (SECT)
 *
 * SECT-FACTURATION-IMPROVEMENTS : infrastructure de tests E2E.
 *
 * Stratégie :
 *  - Cible l'app déployée sur Vercel (production) par défaut (BASE_URL env).
 *  - Un seul projet chromium (léger, suffisant pour la régression fonctionnelle).
 *  - Auth via storageState : on se connecte une fois (admin), on sauvegarde
 *    l'état (cookies + localStorage), et les tests le réutilisent (parallélisable).
 *  - Pas de webserver local (l'app est sur Vercel, le backend sur Render).
 *
 * Run :
 *   bunx playwright test              # tous les tests
 *   bunx playwright test --headed     # visible
 *   bunx playwright test --ui         # mode interactif
 *   bunx playwright show-report       # voir le rapport HTML
 */
import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'https://sect-app.vercel.app'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // séquentiel : on partage une DB, éviter les conflits
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'fr-FR',
    timezoneId: 'Africa/Abidjan',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    // Setup : login admin + sauvegarde du storageState
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Tests dépendants (utilisent le storageState)
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],
})
