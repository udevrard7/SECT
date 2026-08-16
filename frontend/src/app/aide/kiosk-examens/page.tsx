import type { Metadata } from 'next'
import Link from 'next/link'
import { Monitor, Download, Shield, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Mode kiosk pour examens — Guide B2B SECT',
  description: 'Déploiement de SECT en salle d\'examen : mode kiosk verrouillé, anti-fraude, scripts Windows/Linux.',
}

/**
 * Page /aide/kiosk-examens — Guide B2B pour les établissements.
 *
 * SECT-PWA-DESKTOP-1 : documente le déploiement de SECT en salle d'examen
 * avec mode kiosk (plein écran verrouillé). Cible les responsables B2B et
 * les administrateurs informatiques d'établissements.
 *
 * Page publique (accessible sans auth, dans /aide/).
 */
export default function KioskExamensPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="space-y-4 mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
            <Shield className="h-3.5 w-3.5" />
            Guide B2B — Établissements
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">
            Mode kiosk pour examens en salle
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
            Déployez SECT en mode plein écran verrouillé sur les postes de votre salle
            d&apos;examen. Les étudiants composent dans un environnement sécurisé, sans accès
            aux autres applications, onglets ou extensions du navigateur.
          </p>
        </div>

        {/* Avantages */}
        <section className="mb-12">
          <h2 className="font-display text-xl font-semibold mb-4">Pourquoi le mode kiosk ?</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { icon: Shield, title: 'Anti-fraude renforcé', desc: 'Les étudiants ne peuvent pas ouvrir d\'autres onglets, applications ou extensions pendant l\'examen.' },
              { icon: Monitor, title: 'Plein écran verrouillé', desc: 'SECT occupe tout l\'écran, sans barre d\'outils ni menu navigateur visibles.' },
              { icon: CheckCircle2, title: 'Lancement automatique', desc: 'Le script peut se lancer au démarrage de Windows/Linux, sans intervention manuelle.' },
              { icon: AlertTriangle, title: 'Sortie verrouillée', desc: 'Pour quitter : Alt+F4 (Windows) ou Ctrl+Shift+Q (Linux). Surveillant requis.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-lg border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-sm">{title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Téléchargement scripts */}
        <section className="mb-12 rounded-xl border bg-card p-6">
          <h2 className="font-display text-xl font-semibold mb-2">Télécharger les scripts</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Choisissez le script selon le système d&apos;exploitation de vos postes.
            Placez le fichier sur chaque poste de la salle d&apos;examen.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <a
              href="/downloads/sect-kiosk-windows.bat"
              download
              className="flex items-center gap-3 rounded-lg border bg-background p-4 hover:bg-accent transition-colors group"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Download className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-sm">Windows (.bat)</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Chrome / Edge — 1,2 Ko</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a
              href="/downloads/sect-kiosk-linux.sh"
              download
              className="flex items-center gap-3 rounded-lg border bg-background p-4 hover:bg-accent transition-colors group"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Download className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-sm">Linux (.sh)</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Chrome / Chromium / Firefox — 1,5 Ko</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </a>
          </div>
        </section>

        {/* Installation Windows */}
        <section className="mb-12 space-y-4">
          <h2 className="font-display text-xl font-semibold">Installation sur Windows</h2>
          <ol className="space-y-3">
            {[
              <>Téléchargez <code className="px-1 py-0.5 rounded bg-muted text-xs">sect-kiosk-windows.bat</code> ci-dessus.</>,
              <>Placez-le dans un dossier fixe, par exemple <code className="px-1 py-0.5 rounded bg-muted text-xs">C:\SECT\</code>.</>,
              <>Testez en double-cliquant : Chrome doit s&apos;ouvrir en plein écran sur la page de login SECT.</>,
              <>Pour un lancement automatique au démarrage : créez un raccourci vers le <code className="px-1 py-0.5 rounded bg-muted text-xs">.bat</code> et placez-le dans <code className="px-1 py-0.5 rounded bg-muted text-xs">C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\</code>.</>,
              <>Pour quitter le mode kiosk : <kbd className="px-1.5 py-0.5 rounded border bg-muted text-xs">Alt</kbd> + <kbd className="px-1.5 py-0.5 rounded border bg-muted text-xs">F4</kbd>.</>,
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

        {/* Installation Linux */}
        <section className="mb-12 space-y-4">
          <h2 className="font-display text-xl font-semibold">Installation sur Linux</h2>
          <ol className="space-y-3">
            {[
              <>Téléchargez <code className="px-1 py-0.5 rounded bg-muted text-xs">sect-kiosk-linux.sh</code> ci-dessus.</>,
              <>Rendez-le exécutable : <code className="px-1 py-0.5 rounded bg-muted text-xs">chmod +x sect-kiosk-linux.sh</code></>,
              <>Testez : <code className="px-1 py-0.5 rounded bg-muted text-xs">./sect-kiosk-linux.sh</code></>,
              <>Pour un lancement automatique : placez le script dans <code className="px-1 py-0.5 rounded bg-muted text-xs">~/.config/autostart/</code> ou <code className="px-1 py-0.5 rounded bg-muted text-xs">/etc/xdg/autostart/</code> (tous les utilisateurs).</>,
              <>Pour quitter le mode kiosk : <kbd className="px-1.5 py-0.5 rounded border bg-muted text-xs">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 rounded border bg-muted text-xs">Shift</kbd> + <kbd className="px-1.5 py-0.5 rounded border bg-muted text-xs">Q</kbd>.</>,
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

        {/* Prérequis */}
        <section className="mb-12 rounded-xl border bg-muted/30 p-6">
          <h2 className="font-display text-xl font-semibold mb-4">Prérequis techniques</h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <span><strong>Chrome / Edge / Chromium</strong> installé sur chaque poste (Firefox supporté depuis la v71).</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <span><strong>Connexion internet</strong> stable (SECT fonctionne en ligne, sync Neon PostgreSQL).</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <span><strong>Webcam</strong> (optionnel) pour la photo d&apos;identité anti-fraude.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <span><strong>Comptes étudiants</strong> créés dans SECT par le responsable d&apos;établissement.</span>
            </li>
          </ul>
        </section>

        {/* Surveillance complémentaire */}
        <section className="mb-12 rounded-xl border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 p-6">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-lg font-semibold text-emerald-900 dark:text-emerald-100 mb-2">
                Surveillance temps réel SECT
              </h2>
              <p className="text-sm text-emerald-800 dark:text-emerald-200 leading-relaxed">
                Le mode kiosk est complémentaire du module <strong>Surveillance anti-fraude</strong> de SECT :
                fullscreen obligatoire, capture d&apos;écran périodique, détection de similarité
                entre copies, photo d&apos;identité, et dashboard temps réel pour les enseignants
                surveillants (WebSocket). Activez ces options dans <strong>Paramètres &raquo; Sécurité</strong>.
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="pt-8 border-t text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            Besoin d&apos;aide pour le déploiement ?{' '}
            <a href="mailto:contact@sect.ftci.fr" className="text-primary underline hover:no-underline">
              contact@sect.ftci.fr
            </a>
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/aide/installation"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-border bg-card text-foreground text-sm font-medium hover:bg-accent transition-colors"
            >
              Guide d&apos;installation générale
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Retour au tableau de bord
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

      </div>
    </main>
  )
}
