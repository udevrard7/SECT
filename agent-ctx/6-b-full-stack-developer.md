# Task 6-b: Configuration Page, Password Reset UI, Invitation UI, User Import UI

## Summary

All 4 sub-tasks completed successfully:

### 1. Configuration Page Updated
- **File**: `/src/components/configuration/configuration-page.tsx`
- Replaced localStorage with `GET /api/platform-settings` on mount
- Saves via `POST /api/platform-settings` (tabbed UI → flat API mapping)
- Loading skeleton, error state with retry, success/error toasts
- General tab: siteName, siteDescription, maintenanceMode, registrationOpen, contactEmail, helpUrl, legalNoticeUrl, privacyPolicyUrl
- Security tab: maxUploadSizeMB, allowedFileTypes (toggle), proctoringEnabled
- Notifications tab: emailNotifications, defaultPlanType
- IA tab: aiGenerationEnabled, aiCorrectionEnabled

### 2. Password Reset Dialog Added to Login Form
- **File**: `/src/components/auth/login-form.tsx`
- "Mot de passe oublié ?" → opens reset request Dialog
- Email input → calls POST /api/auth/password-reset → shows success + dev token notice
- Second Dialog for token + new password → calls POST /api/auth/password-reset/confirm
- Success/error toasts, "Retour à la connexion" on success

### 3. Invitation UI Added to Utilisateurs Page
- **File**: `/src/components/utilisateurs/utilisateurs-page.tsx`
- "Inviter" button in header → Dialog with email, role, name, etablissementId
- Calls POST /api/invitations
- Invitations list section at bottom (GET /api/invitations)
- Each invitation: email, role, name, etablissement, date, status
- "Annuler" button → DELETE /api/invitations/[id] with confirmation

### 4. User Import Button Added
- Same file as #3
- "Importer" button in header → Dialog with role select + CSV textarea
- Parses email,name per line → calls POST /api/users/import
- Shows created users with passwords (copy button), errors

## Verification
- `bun run lint`: passes with zero errors
- Dev server: running on port 3000, HTTP 200
