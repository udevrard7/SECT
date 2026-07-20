'use client'

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT-HELPERS — Helpers partagés pour l'affichage des journaux d'audit.
//
// SECT-ETABLISSEMENT-AUDIT-1 : extraction depuis logs-page.tsx (admin) afin de
// réutiliser les mêmes badges / icônes / labels côté RESPONSABLE (nouvel onglet
// Audit de la page Paramètres établissement). Toutes les fonctions sont pures
// et n'ont pas de dépendance React stateful — elles peuvent être importées par
// n'importe quel composant client.
//
// Palette Savane EdTech : bg-success / text-success-text / bg-info / bg-warning
// / bg-destructive. Aucune couleur indigo/bleu.
// ═══════════════════════════════════════════════════════════════════════════

import {
  Activity,
  AlertTriangle,
  Ban,
  Clock,
  Edit3,
  Link2,
  LogIn,
  LogOut,
  PlusCircle,
  Trash2,
} from 'lucide-react'
import { Badge as DSBadge } from '@/components/ds'

// ─── Types ───

/**
 * AuditLogItem — entrée du journal d'audit telle que renvoyée par l'API.
 *
 * `etablissementId` et `reason` sont optionnels : la table AuditLog a été
 * étendue (migration 000083) pour porter ces colonnes, mais les anciennes
 * entrées (pré-migration) n'en disposent pas. On garde donc `?` pour la
 * rétro-compatibilité avec l'endpoint admin /api/logs.
 */
export interface AuditLogItem {
  id: string
  userId: string | null
  userEmail: string | null
  action: string
  entite: string
  entiteId: string | null
  details: string | null
  adresseIp: string | null
  etablissementId?: string | null
  reason?: string | null
  createdAt: string
}

// ─── Action → Badge (DSBadge variant) ───

/**
 * getActionBadge — retourne un DSBadge coloré en fonction de l'action auditée.
 *
 * Palette :
 *  - success (vert lime) → créations
 *  - info (bleu nuit)    → modifications, corrections IA, changements de mot de passe
 *  - danger (rouge)      → suppressions, échecs, révocations
 *  - warning (terre cuite) → connexions, soumissions forcées
 *  - default (muted)     → déconnexions, refresh token
 *
 * Étends l'implémentation originale de logs-page.tsx avec :
 *  - SIGNUP_LINK_CREATED (success)
 *  - SIGNUP_LINK_REVOKED (danger)
 *  - ACCESS_REVOKED      (danger)
 *  - ACCESS_REVOKED_SELF (warning — expiration automatique)
 */
export function getActionBadge(action: string) {
  switch (action) {
    case 'CREATE':
    case 'CREATE_EPREUVE':
    case 'CREATE_USER_DIRECT':
    case 'CREATE_RESPONSABLE_AUTO':
    case 'CREATE_ETABLISSEMENT_WITH_ABO':
    case 'SIGNUP_LINK_CREATED':
      return (
        <DSBadge variant="success" className="gap-1">
          {action === 'SIGNUP_LINK_CREATED' ? (
            <Link2 className="h-3 w-3" />
          ) : (
            <PlusCircle className="h-3 w-3" />
          )}
          {action === 'SIGNUP_LINK_CREATED' ? 'Création lien' : 'Création'}
        </DSBadge>
      )
    case 'UPDATE':
    case 'UPDATE_EPREUVE':
    case 'UPDATE_LOGO':
      return (
        <DSBadge variant="info" className="gap-1">
          <Edit3 className="h-3 w-3" />
          Modification
        </DSBadge>
      )
    case 'DELETE':
    case 'SOFT_DELETE_EPREUVE':
    case 'PURGE_CORBEILLE':
    case 'SIGNUP_LINK_REVOKED':
    case 'ACCESS_REVOKED':
      return (
        <DSBadge variant="danger" className="gap-1">
          {action === 'SIGNUP_LINK_REVOKED' ? (
            <Ban className="h-3 w-3" />
          ) : action === 'ACCESS_REVOKED' ? (
            <Ban className="h-3 w-3" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
          {action === 'SIGNUP_LINK_REVOKED'
            ? 'Révocation lien'
            : action === 'ACCESS_REVOKED'
              ? 'Accès révoqué'
              : 'Suppression'}
        </DSBadge>
      )
    case 'LOGIN':
    case 'LOGIN_MATRICULE':
      return (
        <DSBadge variant="warning" className="gap-1">
          <LogIn className="h-3 w-3" />
          Connexion
        </DSBadge>
      )
    case 'LOGOUT':
      return (
        <DSBadge variant="default" className="gap-1">
          <LogOut className="h-3 w-3" />
          Déconnexion
        </DSBadge>
      )
    case 'LOGIN_FAILED':
    case 'LOGIN_LOCKED':
      return (
        <DSBadge variant="danger" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          {action === 'LOGIN_LOCKED' ? 'Verrouillé' : 'Échec connexion'}
        </DSBadge>
      )
    case 'TOKEN_REFRESHED':
      return (
        <DSBadge variant="default" className="gap-1">
          <Clock className="h-3 w-3" />
          Refresh token
        </DSBadge>
      )
    case 'CHANGE_PASSWORD':
    case 'PASSWORD_RESET':
      return (
        <DSBadge variant="info" className="gap-1">
          <Edit3 className="h-3 w-3" />
          {action === 'PASSWORD_RESET' ? 'Reset password' : 'Chgmt password'}
        </DSBadge>
      )
    case 'AI_GRADE_RESPONSE':
    case 'AI_BATCH_GRADE':
      return (
        <DSBadge variant="info" className="gap-1">
          <Activity className="h-3 w-3" />
          Correction IA
        </DSBadge>
      )
    case 'FINALIZE_AND_RETURN_CORRECTION':
      return (
        <DSBadge variant="info" className="gap-1">
          <Edit3 className="h-3 w-3" />
          Retour correction
        </DSBadge>
      )
    case 'FORCE_SUBMIT_SESSION':
    case 'AUTO_CLOSE_EPREUVE':
    case 'ACCESS_REVOKED_SELF':
      return (
        <DSBadge variant="warning" className="gap-1">
          {action === 'ACCESS_REVOKED_SELF' ? (
            <Clock className="h-3 w-3" />
          ) : (
            <AlertTriangle className="h-3 w-3" />
          )}
          {action === 'ACCESS_REVOKED_SELF'
            ? 'Expiration accès'
            : 'Auto/Forcé'}
        </DSBadge>
      )
    default:
      return <DSBadge variant="default">{action}</DSBadge>
  }
}

// ─── Action → Icone (lucide) ───

/**
 * getActionIcon — retourne une icône lucide colorée pour la timeline.
 * Doit rester cohérent avec getActionBadge (même palette par action).
 */
export function getActionIcon(action: string) {
  switch (action) {
    case 'CREATE':
    case 'CREATE_EPREUVE':
    case 'CREATE_USER_DIRECT':
    case 'CREATE_RESPONSABLE_AUTO':
    case 'CREATE_ETABLISSEMENT_WITH_ABO':
    case 'SIGNUP_LINK_CREATED':
      return action === 'SIGNUP_LINK_CREATED' ? (
        <Link2 className="h-5 w-5 text-success-text" />
      ) : (
        <PlusCircle className="h-5 w-5 text-success-text" />
      )
    case 'UPDATE':
    case 'UPDATE_EPREUVE':
    case 'UPDATE_LOGO':
    case 'CHANGE_PASSWORD':
    case 'PASSWORD_RESET':
    case 'FINALIZE_AND_RETURN_CORRECTION':
      return <Edit3 className="h-5 w-5 text-info" />
    case 'DELETE':
    case 'SOFT_DELETE_EPREUVE':
    case 'PURGE_CORBEILLE':
    case 'SIGNUP_LINK_REVOKED':
    case 'ACCESS_REVOKED':
      return action === 'SIGNUP_LINK_REVOKED' || action === 'ACCESS_REVOKED' ? (
        <Ban className="h-5 w-5 text-destructive" />
      ) : (
        <Trash2 className="h-5 w-5 text-destructive" />
      )
    case 'LOGIN':
    case 'LOGIN_MATRICULE':
      return <LogIn className="h-5 w-5 text-warning" />
    case 'LOGOUT':
      return <LogOut className="h-5 w-5 text-muted-foreground" />
    case 'LOGIN_FAILED':
    case 'LOGIN_LOCKED':
      return <AlertTriangle className="h-5 w-5 text-destructive" />
    case 'TOKEN_REFRESHED':
      return <Clock className="h-5 w-5 text-muted-foreground" />
    case 'AI_GRADE_RESPONSE':
    case 'AI_BATCH_GRADE':
      return <Activity className="h-5 w-5 text-info" />
    case 'FORCE_SUBMIT_SESSION':
    case 'AUTO_CLOSE_EPREUVE':
    case 'ACCESS_REVOKED_SELF':
      return action === 'ACCESS_REVOKED_SELF' ? (
        <Clock className="h-5 w-5 text-warning" />
      ) : (
        <AlertTriangle className="h-5 w-5 text-warning" />
      )
    default:
      return <Activity className="h-5 w-5 text-muted-foreground" />
  }
}

// ─── Entité → Label français ───

/**
 * getEntityLabel — mappe le code entité (tel que stocké en DB) vers un label
 * français lisible. Étendu avec :
 *  - StudentSignupLink     → "Lien d'inscription étudiante"
 *  - EtablissementAccess   → "Accès établissement"
 *  - RegistrationEvent     → "Événement d'inscription"
 *  - IpWhitelist           → "Liste blanche IP"
 *  - SecuritySettings      → "Paramètres sécurité" (déjà présent)
 */
export function getEntityLabel(entite: string): string {
  switch (entite) {
    case 'User':
      return 'Utilisateur'
    case 'Etablissement':
      return 'Établissement'
    case 'Filiere':
      return 'Filière'
    case 'Epreuve':
      return 'Épreuve'
    case 'Question':
      return 'Question'
    case 'Document':
      return 'Document'
    case 'Session':
      return 'Session'
    case 'Reponse':
      return 'Réponse'
    case 'SessionPassation':
      return 'Session de passation'
    case 'Affectation':
      return 'Affectation'
    case 'Corbeille':
      return 'Corbeille'
    case 'UniteEnseignement':
      return 'Unité d\'enseignement'
    case 'SecuritySettings':
      return 'Paramètres sécurité'
    case 'StudentSignupLink':
      return 'Lien d\'inscription étudiante'
    case 'EtablissementAccess':
      return 'Accès établissement'
    case 'RegistrationEvent':
      return 'Événement d\'inscription'
    case 'IpWhitelist':
      return 'Liste blanche IP'
    default:
      return entite
  }
}

// ─── Formatage dates ───

/**
 * formatLogDate — formate une date ISO en "dd/MM/yyyy HH:mm:ss" (locale fr-FR).
 */
export function formatLogDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/**
 * formatRelativeDate — retourne un libellé relatif ("Il y a 5 min", "Il y a 2h",
 * "Il y a 3j") ou bascule sur formatLogDate au-delà de 7 jours.
 */
export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffH = Math.floor(diffMin / 60)
  const diffD = Math.floor(diffH / 24)

  if (diffMin < 1) return 'À l\'instant'
  if (diffMin < 60) return `Il y a ${diffMin} min`
  if (diffH < 24) return `Il y a ${diffH}h`
  if (diffD < 7) return `Il y a ${diffD}j`
  return formatLogDate(dateStr)
}

// ─── Parsing JSON safe ───

/**
 * parseJsonSafe — tente de parser `str` en JSON. Retourne la chaîne brute si
 * le parsing échoue (ou null si str est vide/null). Utilisé pour formatter le
 * champ `details` (TEXT libre stockant du JSON) côté UI.
 */
export function parseJsonSafe(str: string | null): unknown {
  if (!str) return null
  try {
    return JSON.parse(str)
  } catch {
    return str
  }
}
