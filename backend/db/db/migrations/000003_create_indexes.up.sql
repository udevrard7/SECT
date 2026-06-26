-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_matricule_key" ON "User"("matricule");

-- CreateIndex
CREATE INDEX "User_etablissementId_idx" ON "User"("etablissementId");

-- CreateIndex
CREATE INDEX "User_filiereId_idx" ON "User"("filiereId");

-- CreateIndex
CREATE UNIQUE INDEX "Etablissement_nom_key" ON "Etablissement"("nom");

-- CreateIndex
CREATE INDEX "Filiere_etablissementId_idx" ON "Filiere"("etablissementId");

-- CreateIndex
CREATE INDEX "Filiere_responsableId_idx" ON "Filiere"("responsableId");

-- CreateIndex
CREATE UNIQUE INDEX "Filiere_nom_etablissementId_key" ON "Filiere"("nom", "etablissementId");

-- CreateIndex
CREATE INDEX "EnseignantFiliere_filiereId_idx" ON "EnseignantFiliere"("filiereId");

-- CreateIndex
CREATE UNIQUE INDEX "EnseignantFiliere_enseignantId_filiereId_niveau_key" ON "EnseignantFiliere"("enseignantId", "filiereId", "niveau");

-- CreateIndex
CREATE INDEX "UniteEnseignement_filiereId_idx" ON "UniteEnseignement"("filiereId");

-- CreateIndex
CREATE UNIQUE INDEX "UniteEnseignement_code_filiereId_key" ON "UniteEnseignement"("code", "filiereId");

-- CreateIndex
CREATE INDEX "UniteEnseignementFiliere_filiereId_idx" ON "UniteEnseignementFiliere"("filiereId");

-- CreateIndex
CREATE UNIQUE INDEX "UniteEnseignementFiliere_uniteEnseignementId_filiereId_key" ON "UniteEnseignementFiliere"("uniteEnseignementId", "filiereId");

-- CreateIndex
CREATE INDEX "Affectation_uniteEnseignementId_idx" ON "Affectation"("uniteEnseignementId");

-- CreateIndex
CREATE UNIQUE INDEX "Affectation_enseignantId_uniteEnseignementId_typeSeance_gro_key" ON "Affectation"("enseignantId", "uniteEnseignementId", "typeSeance", "groupe", "anneeUniversitaire");

-- CreateIndex
CREATE INDEX "Document_ownerId_idx" ON "Document"("ownerId");

-- CreateIndex
CREATE INDEX "Document_uniteEnseignementId_idx" ON "Document"("uniteEnseignementId");

-- CreateIndex
CREATE INDEX "Question_documentId_idx" ON "Question"("documentId");

-- CreateIndex
CREATE INDEX "Epreuve_filiereId_niveau_sessionExamen_idx" ON "Epreuve"("filiereId", "niveau", "sessionExamen");

-- CreateIndex
CREATE INDEX "Epreuve_enseignantId_statut_idx" ON "Epreuve"("enseignantId", "statut");

-- CreateIndex
CREATE INDEX "Epreuve_anneeAcademiqueId_idx" ON "Epreuve"("anneeAcademiqueId");

-- CreateIndex
CREATE INDEX "Epreuve_epreuveOrigineId_idx" ON "Epreuve"("epreuveOrigineId");

-- CreateIndex
CREATE INDEX "Epreuve_uniteEnseignementId_idx" ON "Epreuve"("uniteEnseignementId");

-- CreateIndex
CREATE INDEX "EpreuveQuestion_questionId_idx" ON "EpreuveQuestion"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "EpreuveQuestion_epreuveId_questionId_key" ON "EpreuveQuestion"("epreuveId", "questionId");

-- CreateIndex
CREATE INDEX "EpreuveDocument_documentId_idx" ON "EpreuveDocument"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "EpreuveDocument_epreuveId_documentId_key" ON "EpreuveDocument"("epreuveId", "documentId");

-- CreateIndex
CREATE INDEX "SessionPassation_epreuveId_idx" ON "SessionPassation"("epreuveId");

-- CreateIndex
CREATE INDEX "SessionPassation_etudiantId_idx" ON "SessionPassation"("etudiantId");

-- CreateIndex
CREATE UNIQUE INDEX "Reponse_sessionId_questionId_key" ON "Reponse"("sessionId", "questionId");

-- CreateIndex
CREATE INDEX "Alerte_epreuveId_idx" ON "Alerte"("epreuveId");

-- CreateIndex
CREATE INDEX "Alerte_filiereId_idx" ON "Alerte"("filiereId");

-- CreateIndex
CREATE INDEX "Alerte_userId_idx" ON "Alerte"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Resultat_sessionId_key" ON "Resultat"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_nom_key" ON "Plan"("nom");

-- CreateIndex
CREATE INDEX "Abonnement_etablissementId_idx" ON "Abonnement"("etablissementId");

-- CreateIndex
CREATE INDEX "Abonnement_planId_idx" ON "Abonnement"("planId");

-- CreateIndex
CREATE INDEX "EtablissementAccess_etablissementId_idx" ON "EtablissementAccess"("etablissementId");

-- CreateIndex
CREATE UNIQUE INDEX "EtablissementAccess_adminId_etablissementId_key" ON "EtablissementAccess"("adminId", "etablissementId");

-- CreateIndex
CREATE UNIQUE INDEX "SecuritySettings_etablissementId_key" ON "SecuritySettings"("etablissementId");

-- CreateIndex
CREATE INDEX "Devoir_enseignantId_idx" ON "Devoir"("enseignantId");

-- CreateIndex
CREATE INDEX "Devoir_uniteEnseignementId_idx" ON "Devoir"("uniteEnseignementId");

-- CreateIndex
CREATE UNIQUE INDEX "GrilleEvaluation_devoirId_key" ON "GrilleEvaluation"("devoirId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "Invitation_token_idx" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_createdById_idx" ON "Invitation"("createdById");

-- CreateIndex
CREATE INDEX "Invitation_etablissementId_idx" ON "Invitation"("etablissementId");

-- CreateIndex
CREATE INDEX "Invitation_filiereId_idx" ON "Invitation"("filiereId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_token_key" ON "PasswordReset"("token");

-- CreateIndex
CREATE INDEX "PasswordReset_token_idx" ON "PasswordReset"("token");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");

-- CreateIndex
CREATE INDEX "Soumission_etudiantId_idx" ON "Soumission"("etudiantId");

-- CreateIndex
CREATE UNIQUE INDEX "Soumission_devoirId_etudiantId_key" ON "Soumission"("devoirId", "etudiantId");

-- CreateIndex
CREATE UNIQUE INDEX "Facture_numero_key" ON "Facture"("numero");

-- CreateIndex
CREATE INDEX "Facture_abonnementId_idx" ON "Facture"("abonnementId");

-- CreateIndex
CREATE INDEX "Facture_etablissementId_idx" ON "Facture"("etablissementId");

-- CreateIndex
CREATE INDEX "NotificationAdmin_destinataireId_idx" ON "NotificationAdmin"("destinataireId");

-- CreateIndex
CREATE UNIQUE INDEX "IpWhitelist_adresseIp_key" ON "IpWhitelist"("adresseIp");

-- CreateIndex
CREATE INDEX "IpWhitelist_etablissementId_idx" ON "IpWhitelist"("etablissementId");

-- CreateIndex
CREATE UNIQUE INDEX "AIProviderConfig_name_key" ON "AIProviderConfig"("name");

-- CreateIndex
CREATE INDEX "AnneeAcademique_etablissementId_idx" ON "AnneeAcademique"("etablissementId");

-- CreateIndex
CREATE UNIQUE INDEX "AnneeAcademique_libelle_etablissementId_key" ON "AnneeAcademique"("libelle", "etablissementId");

-- CreateIndex
CREATE INDEX "SessionSpeciale_epreuveOrigineId_idx" ON "SessionSpeciale"("epreuveOrigineId");

-- CreateIndex
CREATE INDEX "SessionSpeciale_epreuveDeriveeId_idx" ON "SessionSpeciale"("epreuveDeriveeId");

-- CreateIndex
CREATE INDEX "SessionSpeciale_creeParId_idx" ON "SessionSpeciale"("creeParId");

-- CreateIndex
CREATE INDEX "SessionSpeciale_type_idx" ON "SessionSpeciale"("type");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeDefinition_cle_key" ON "BadgeDefinition"("cle");

-- CreateIndex
CREATE INDEX "BadgeProgression_userId_idx" ON "BadgeProgression"("userId");

-- CreateIndex
CREATE INDEX "BadgeProgression_badgeDefinitionId_idx" ON "BadgeProgression"("badgeDefinitionId");

-- CreateIndex
CREATE INDEX "BadgeProgression_debloque_idx" ON "BadgeProgression"("debloque");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeProgression_userId_badgeDefinitionId_key" ON "BadgeProgression"("userId", "badgeDefinitionId");

-- CreateIndex
CREATE INDEX "ValidationUE_etudiantId_idx" ON "ValidationUE"("etudiantId");

-- CreateIndex
CREATE INDEX "ValidationUE_uniteEnseignementId_idx" ON "ValidationUE"("uniteEnseignementId");

-- CreateIndex
CREATE INDEX "ValidationUE_statut_idx" ON "ValidationUE"("statut");

-- CreateIndex
CREATE INDEX "ValidationUE_anneeAcademiqueId_idx" ON "ValidationUE"("anneeAcademiqueId");

-- CreateIndex
CREATE UNIQUE INDEX "ValidationUE_etudiantId_uniteEnseignementId_anneeAcademique_key" ON "ValidationUE"("etudiantId", "uniteEnseignementId", "anneeAcademiqueId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificat_codeVerification_key" ON "Certificat"("codeVerification");

-- CreateIndex
CREATE INDEX "Certificat_etudiantId_idx" ON "Certificat"("etudiantId");

-- CreateIndex
CREATE INDEX "Certificat_codeVerification_idx" ON "Certificat"("codeVerification");

-- CreateIndex
CREATE INDEX "Certificat_type_idx" ON "Certificat"("type");

-- CreateIndex
CREATE INDEX "Certificat_statut_idx" ON "Certificat"("statut");

-- CreateIndex
CREATE INDEX "Certificat_emetteParId_idx" ON "Certificat"("emetteParId");

-- CreateIndex
CREATE INDEX "Certificat_validationUEId_idx" ON "Certificat"("validationUEId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "Chapter_documentId_idx" ON "Chapter"("documentId");

-- CreateIndex
CREATE INDEX "ChatThread_userId_idx" ON "ChatThread"("userId");

-- CreateIndex
CREATE INDEX "ChatThread_documentId_idx" ON "ChatThread"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatThread_userId_documentId_key" ON "ChatThread"("userId", "documentId");

-- CreateIndex
CREATE INDEX "ChatMessage_threadId_idx" ON "ChatMessage"("threadId");

-- CreateIndex
CREATE INDEX "ReviewItem_userId_nextReviewAt_idx" ON "ReviewItem"("userId", "nextReviewAt");

-- CreateIndex
CREATE INDEX "ReviewItem_chapterId_idx" ON "ReviewItem"("chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewItem_userId_chapterId_key" ON "ReviewItem"("userId", "chapterId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewItem_userId_questionId_key" ON "ReviewItem"("userId", "questionId");

-- CreateIndex
CREATE INDEX "Flashcard_chapterId_idx" ON "Flashcard"("chapterId");

-- CreateIndex
CREATE INDEX "Flashcard_documentId_idx" ON "Flashcard"("documentId");

-- CreateIndex
CREATE INDEX "StudySession_userId_dateDebut_idx" ON "StudySession"("userId", "dateDebut");

-- CreateIndex
CREATE INDEX "StudySession_documentId_idx" ON "StudySession"("documentId");

-- CreateIndex
CREATE INDEX "HelpThread_documentId_idx" ON "HelpThread"("documentId");

-- CreateIndex
CREATE INDEX "HelpThread_etudiantId_idx" ON "HelpThread"("etudiantId");

-- CreateIndex
CREATE INDEX "HelpThread_enseignantId_idx" ON "HelpThread"("enseignantId");

-- CreateIndex
CREATE INDEX "HelpMessage_threadId_idx" ON "HelpMessage"("threadId");

-- CreateIndex
CREATE INDEX "HelpMessage_auteurId_idx" ON "HelpMessage"("auteurId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_userId_idx" ON "PracticeAttempt"("userId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_questionId_idx" ON "PracticeAttempt"("questionId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_documentId_idx" ON "PracticeAttempt"("documentId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_chapterId_idx" ON "PracticeAttempt"("chapterId");

