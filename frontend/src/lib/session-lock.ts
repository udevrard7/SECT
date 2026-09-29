/**
 * SESSION-TIMEOUT-1 : verrou navigateur pour sérialiser les checks de session
 * entre onglets (Web Locks API).
 *
 * Pourquoi : les onglets partagent le même cookie jar httpOnly. Quand deux
 * onglets détectent en même temps un access token expiré (15 min), chacun
 * appelle /api/go-auth/session → deux POST /api/auth/refresh avec le MÊME
 * refresh token. Avant la grâce backend (60 s), le second recevait 401
 * « déjà utilisé » → clearSessionResponse() supprimait les cookies — y compris
 * le nouveau refresh token fraîchement posé par le premier → déconnexion de
 * TOUS les onglets en pleine utilisation.
 *
 * Avec le verrou : l'onglet B attend que l'onglet A ait terminé. Le fetch de B
 * part alors avec le NOUVEAU access_token (mis à jour par la réponse de A) →
 * /api/me 200 → pas de refresh du tout.
 *
 * Fallback : navigateurs sans Web Locks (anciens Safari < 15.4) → exécution
 * directe. La grâce backend couvre ce cas.
 */
export async function withSessionLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('sect-session-check', { mode: 'exclusive' }, () => fn())
  }
  return fn()
}
