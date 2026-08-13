// SECT Mobile — [DEPRECATED] ProctoringService has been migrated to shared/proctoring/
// Utilisez com.sect.mobile.shared.proctoring.ProctoringService (interface)
// et com.sect.mobile.shared.proctoring.ProctoringEngine (moteur de règles centralisé)
//
// Architecture hybride du proctoring :
// - ProctoringEngine (commonMain) — logique métier centralisée : règles, agrégation d'alertes, terminaison
// - ProctoringService (interface)  — abstraction pour les drivers natifs
// - AndroidProctoringService       — implémentation Android (lifecycle, caméra, FLAG_SECURE)
// - iOSProctoringService           — implémentation iOS (AVCaptureSession, Vision, Guided Access)
//
// Les drivers natifs COLLECTENT les métriques matérielles.
// Le moteur PROCESSE les événements selon les règles métier.
package com.sect.mobile.shared.platform.proctoring

@Deprecated(
    message = "Migré vers com.sect.mobile.shared.proctoring.ProctoringService + ProctoringEngine",
    level = DeprecationLevel.ERROR
)
object ProctoringServiceShim
