# Task 3-b: Redesign Admin Dashboard for SaaS/PaaS Platform Owner

## Agent: full-stack-developer
## Status: COMPLETED

## Summary
Redesigned the Admin Dashboard to properly reflect the SaaS/PaaS platform owner role with strict tenant isolation. Removed all establishment-specific data from the admin view and added access authorization management.

## Files Modified

### 1. `/home/z/my-project/src/app/api/stats/admin/route.ts`
- **Removed**: All establishment-specific queries (nbEvaluations, nbQuestions, nbDocuments, epreuvesParStatut, questionsParType, tauxReussiteGlobal, recentActivities, creationTrend)
- **Added**: nbAutorisationsActives (APPROUVE count), nbAutorisationsEnAttente (EN_ATTENTE count), etablissementsOverview array
- **Added**: adminId query param support for computing adminHasAccess per establishment
- **Kept**: Platform-level metrics only (nbEtablissements, abonnements, revenus, repartitionPlans, etablissementsParStatut, nbEtablissementsProteges, nbVerificationIdentite)

### 2. `/home/z/my-project/src/app/api/etablissement-access/[id]/route.ts`
- Replaced previous version with simplified PATCH endpoint for status updates (APPROUVE, REFUSE, EXPIRE)
- Includes audit logging

### 3. `/home/z/my-project/src/components/dashboard/admin-dashboard.tsx`
- Complete rewrite with 6 sections:
  1. **Welcome**: Name + "Propriétaire de la plateforme" badge + 🔒 access notice
  2. **KPI Row**: 6 platform-level stat cards (revenue, establishments, subscriptions, conversion, health, authorizations)
  3. **Revenue Chart + Plan Distribution**: 2-column layout with platform-level notes
  4. **Établissements Overview**: Card-based layout with access request/view details buttons
  5. **Access Authorizations Panel**: Tables for pending/active/expired authorizations
  6. **Platform Health Card**: 2-column with metrics + visual score
- Added Access Request Dialog (motif, date range, commentaire)
- Removed: tauxReussiteGlobal, nbEvaluations, nbQuestions, nbDocuments, recentActivities, questionsParType, epreuvesParStatut, Performance globale card, bar chart by status

## Lint Status
✅ Passes cleanly
