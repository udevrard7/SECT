// copy-pdfjs-assets.mjs — SECT-BIBLIO-14 : synchronise les assets
// statiques de pdfjs-dist dans public/pdfjs/.
//
// Le lecteur sécurisé (rendu canvas) charge le worker et les polices
// standard depuis des URL STATIQUES même-origine (/pdfjs/…) — déterministe
// en dev, en CI et sur Vercel (public/ est commité, ce script ne sert
// qu'après un bump de version pdfjs-dist pour garder la synchronisation
// worker ↔ bibliothèque, sinon « Setting up fake worker failed »).
//
// LANCÉ PAR : postinstall (bun install / CI / Vercel).
import { cpSync, mkdirSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let version
try {
  ;({ version } = require('pdfjs-dist/package.json'))
} catch {
  console.error(
    '[copy-pdfjs-assets] pdfjs-dist introuvable dans node_modules — installer d’abord les dépendances.',
  )
  process.exit(1)
}

const root = 'node_modules/pdfjs-dist'
const dest = 'public/pdfjs'

mkdirSync(dest, { recursive: true })
cpSync(`${root}/build/pdf.worker.min.mjs`, `${dest}/pdf.worker.min.mjs`)
cpSync(`${root}/standard_fonts`, `${dest}/standard_fonts`, {
  recursive: true,
})
cpSync(`${root}/cmaps`, `${dest}/cmaps`, { recursive: true })

// Garde anti-désynchronisation : le worker copié doit exister.
if (!existsSync(`${dest}/pdf.worker.min.mjs`)) {
  console.error('[copy-pdfjs-assets] échec de copie du worker pdf.js')
  process.exit(1)
}

console.log(`[copy-pdfjs-assets] pdfjs-dist ${version} → ${dest} OK`)
