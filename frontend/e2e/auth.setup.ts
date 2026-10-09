/**
 * Setup : login admin programmatique + sauvegarde du storageState.
 *
 * SECT-FACTURATION-IMPROVEMENTS : authentification partagée pour les tests E2E.
 *
 * Approche : appeler directement le backend Go (/api/auth/login) pour récupérer
 * les tokens dans le body de la réponse (accessToken + refreshToken), puis les
 * poser manuellement comme cookies httpOnly dans le contexte navigateur via
 * context.addCookies(). Cela évite les problèmes de partage de cookie jar entre
 * page.request et la navigation.
 *
 * Credentials : OBLIGATOIREMENT depuis env (ADMIN_EMAIL / ADMIN_PASSWORD).
 * SECURITY-FIX (audit 2026-09) : les fallbacks en dur (email + mot de passe
 * d'un compte admin) étaient commités dans le repo — un test doit échouer
 * explicitement si les variables ne sont pas fournies. ⚠️ Le mot de passe
 * historique exposé dans git doit être ROTÉ côté production.
 * Sortie : e2e/.auth/admin.json (cookies + localStorage — gitignoré)
 */
import { test as setup, expect } from '@playwright/test'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error(
    'E2E : ADMIN_EMAIL et ADMIN_PASSWORD sont requis (compte de test dédié, ' +
    'jamais un compte de production). Voir frontend/.env.example.',
  )
}
const BACKEND_URL = process.env.BACKEND_URL || 'https://api.sect.ftci.fr'

setup('authenticate as admin', async ({ page, request }) => {
  // 1. Login direct sur le backend Go — retourne les tokens dans le body.
  //    Le backend attend { identifier, password } (identifier = email OU matricule).
  const resp = await request.post(`${BACKEND_URL}/api/auth/login`, {
    data: {
      identifier: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
  })

  expect(resp.ok(), `Login backend doit retourner 200, reçu ${resp.status()}`).toBeTruthy()
  const body = await resp.json()
  expect(body.user?.role).toBe('ADMIN')
  expect(body.accessToken).toBeTruthy()
  expect(body.refreshToken).toBeTruthy()

  // 2. Poser les cookies httpOnly manuellement dans le contexte navigateur.
  //    On déduit le domaine depuis baseURL (Vercel) pour que les cookies soient
  //    envoyés lors des navigations vers sect.ftci.fr.
  const baseUrl = new URL(process.env.BASE_URL || 'https://sect.ftci.fr')
  const domain = baseUrl.hostname

  await page.context().addCookies([
    {
      name: 'access_token',
      value: body.accessToken,
      domain,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 15 * 60, // 15 min
    },
    {
      name: 'refresh_token',
      value: body.refreshToken,
      domain,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 jours
    },
  ])

  // 3. Naviguer vers /dashboard — le proxy.ts lit access_token et laisse passer.
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

  // 4. Vérifier qu'on est bien connecté (le proxy redirigerait vers /login sinon)
  await page.waitForURL('**/dashboard', { timeout: 30_000 })
  await expect(page).toHaveURL(/\/dashboard/)

  // 5. Sauvegarder l'état (cookies httpOnly + localStorage auth-store)
  await page.context().storageState({ path: 'e2e/.auth/admin.json' })
})
