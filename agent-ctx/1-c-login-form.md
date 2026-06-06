# Task 1-c: Login Form Component

## Summary
Created `/home/z/my-project/src/components/auth/login-form.tsx` — a full-page login form component for the SECT platform.

## What was implemented
- `'use client'` directive for client-side interactivity
- Full-page centered layout with emerald/teal gradient background
- SECT branding: "SECT" in large bold gradient text with subtitle and tagline
- GraduationCap icon in a gradient square as the logo
- Login Card with:
  - Email input with Mail icon prefix and French labels/placeholder
  - Password input with Lock icon prefix and visibility toggle (Eye/EyeOff)
  - "Se souvenir de moi" checkbox
  - "Mot de passe oublié ?" link
  - "Se connecter" submit button with Loader2 spinner when loading
  - Inline error message display with framer-motion animation
- Demo accounts section in a separate Card with:
  - Table showing Rôle, Email, Mot de passe columns
  - 4 demo accounts: Administrateur, Responsable, Enseignant, Étudiant
  - "Utiliser" button on each row that fills credentials via form.setValue()
- react-hook-form + zod validation (email: valid email, password: min 6 chars)
- useAuthStore.login() for authentication
- sonner toast for error notification on failed login
- framer-motion animations (fade in + slide up) for branding, login card, and demo section
- Responsive design (mobile + desktop)
- Footer: "© 2026 SECT — Tous droits réservés"
- All shadcn/ui components used as specified

## Lint
Passed with zero errors.

## Notes
- Uses `zod` v4 with standard `z` import — compatible with `@hookform/resolvers/zod`
- The login form only handles the login call and error display; redirect is the parent's responsibility
- Password toggle uses Eye/EyeOff icons from lucide-react
