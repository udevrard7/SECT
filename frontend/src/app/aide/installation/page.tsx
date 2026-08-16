import type { Metadata } from 'next'
import Link from 'next/link'
import { Monitor, Smartphone, Tablet, BookOpen, ArrowRight, CheckCircle2 } from 'lucide-react'
import { InstallationClient } from './installation-client'

export const metadata: Metadata = {
  title: 'Installer SECT sur votre appareil — Aide',
  description: 'Guide d\'installation de SECT sur ordinateur, mobile et tablette. Mode kiosk pour les salles d\'examen.',
}

/**
 * Page /aide/installation — Guide complet d'installation PWA.
 *
 * SECT-PWA-DESKTOP-1 : documente comment installer SECT sur tous les appareils
 * (desktop Chrome/Edge, Android, iOS, kiosk mode pour salles d'examen).
 *
 * Server Component (metadata SEO). Le bouton "Installer" interactif est un
 * Client Component séparé (installation-client.tsx) car il utilise useInstallPrompt.
 *
 * Page publique (ajoutée à PUBLIC_PATHS dans proxy.ts).
 */
export default function InstallationHelpPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="text-center space-y-4 mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
            <BookOpen className="h-3.5 w-3.5" />
            Aide SECT
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            Installer SECT sur votre appareil
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            SECT est une application web progressive (PWA). Vous pouvez l&apos;installer
            sur votre ordinateur, tablette ou mobile pour un accès rapide, des
            notifications natives et un fonctionnement hors ligne partiel.
          </p>
        </div>

        {/* Bouton d'installation interactif (s'affiche si le navigateur le permet) */}
        <div className="mb-12">
          <InstallationClient />
        </div>

        {/* Sections par plateforme */}
        <div className="space-y-12">

          {/* Desktop Chrome / Edge */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Monitor className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold">Ordinateur (Chrome / Edge)</h2>
                <p className="text-sm text-muted-foreground">Windows, macOS, Linux</p>
              </div>
            </div>
            <ol className="space-y-3 ml-2">
              {[
                <>Ouvrez <strong>SECT</strong> dans Chrome ou Edge (navigation privée désactivée).</>,
                <>Cliquez sur l&apos;icône <strong>Installer</strong> <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted font-mono">⬇</span> dans la barre d&apos;adresse, ou ouvrez le menu <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted font-mono">⋮</span> puis <strong>&laquo; Installer SECT&hellip;&raquo;</strong>.</>,
                <>Confirmez en cliquant sur <strong>Installer</strong> dans la boîte de dialogue.</>,
                <>SECT s&apos;ouvre dans sa propre fenêtre, avec une icône dans votre menu Démarrer / Launchpad / Applications.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-relaxed pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <p className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Après installation :</strong> SECT fonctionne comme une app native,
                  avec notifications, raccourcis (Dashboard, Épreuves, Correction, Résultats)
                  et lancement depuis le menu démarrer sans ouvrir le navigateur.
                </span>
              </p>
            </div>
          </section>

          {/* Android */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold">Android (Chrome)</h2>
                <p className="text-sm text-muted-foreground">Téléphones et tablettes Android</p>
              </div>
            </div>
            <ol className="space-y-3 ml-2">
              {[
                <>Ouvrez <strong>SECT</strong> dans Chrome sur Android.</>,
                <>Touchez le menu <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted font-mono">⋮</span> en haut à droite.</>,
                <>Sélectionnez <strong>&laquo; Ajouter à l&apos;écran d&apos;accueil&raquo;</strong> ou <strong>&laquo; Installer l&apos;application&raquo;</strong>.</>,
                <>Confirmez. L&apos;icône SECT apparaît sur votre écran d&apos;accueil.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-relaxed pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* iOS / iPadOS */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Tablet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold">iPhone / iPad (Safari)</h2>
                <p className="text-sm text-muted-foreground">iOS / iPadOS</p>
              </div>
            </div>
            <ol className="space-y-3 ml-2">
              {[
                <>Ouvrez <strong>SECT</strong> dans <strong>Safari</strong> (obligatoire — Chrome sur iOS ne supporte pas l&apos;installation PWA).</>,
                <>Touchez le bouton <strong>Partager</strong> <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted font-mono">⬆️</span> en bas de l&apos;écran.</>,
                <>Faites défiler et sélectionnez <strong>&laquo; Sur l&apos;écran d&apos;accueil&raquo;</strong>.</>,
                <>Touchez <strong>Ajouter</strong>. L&apos;icône SECT apparaît sur l&apos;écran d&apos;accueil.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-relaxed pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* Kiosk mode pour salles d'examen */}
          <section className="space-y-4 rounded-xl border bg-card p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Monitor className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold">Mode kiosk — Salles d&apos;examen</h2>
                <p className="text-sm text-muted-foreground">Pour les établissements B2B</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed">
              Pour les examens en salle informatique, lancez SECT en mode plein écran verrouillé
              sur chaque poste. Les étudiants ne peuvent pas ouvrir d&apos;autres onglets ou applications.
            </p>
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Windows (fichier .bat)</p>
              <pre className="rounded-lg bg-slate-950 text-slate-50 p-4 text-xs overflow-x-auto"><code>{`@echo off
start chrome --kiosk --app=https://sect-app.vercel.app/dashboard ^
  --disable-translate --no-first-run --no-default-browser-check ^
  --disable-popup-blocking --disable-extensions`}</code></pre>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Linux (fichier .sh)</p>
              <pre className="rounded-lg bg-slate-950 text-slate-50 p-4 text-xs overflow-x-auto"><code>{`#!/bin/bash
google-chrome --kiosk --app=https://sect-app.vercel.app/dashboard \\
  --disable-translate --no-first-run --no-default-browser-check \\
  --disable-popup-blocking --disable-extensions`}</code></pre>
            </div>
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-3 text-sm">
              <p className="flex items-start gap-2 text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>Astuce :</strong> placez ce script dans le dossier <code className="px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 text-xs">Démarrage</code> de Windows
                  pour qu&apos;il se lance automatiquement à l&apos;ouverture de session.
                </span>
              </p>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            Besoin d&apos;aide supplémentaire ?{' '}
            <a href="mailto:contact@sect.ftci.fr" className="text-primary underline hover:no-underline">
              contact@sect.ftci.fr
            </a>
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Retour au tableau de bord
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

      </div>
    </main>
  )
}
