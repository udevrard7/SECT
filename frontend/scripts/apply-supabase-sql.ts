/**
 * Script d'application du SQL Supabase (RLS, paramètres, etc.) via Prisma.
 *
 * Usage :
 *   bun run scripts/apply-supabase-sql.ts
 *
 * Exécute tous les fichiers `*.sql` du dossier `supabase/` dans l'ordre
 * alphabétique, via `prisma.$executeRawUnsafe`. Idempotent (les scripts SQL
 * doivent être écrits pour supporter une ré-exécution).
 *
 * Gestion des multi-statements : PostgreSQL/Prisma n'acceptent pas plusieurs
 * statements dans une seule requête préparée. Le script splitte donc le SQL
 * sur les `;` en respectant les blocs dollar-quoted (`$$ ... $$`) et les
 * littéraux string (`'...'`).
 *
 * Pour ajouter un nouveau script SQL, déposer un fichier `supabase/*.sql`.
 */
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { db } from '../src/lib/db'

/**
 * Splitte un script SQL en statements individuels, en respectant :
 *  - les blocs dollar-quoted (`$$ ... $$`, `$func$ ... $func$`, etc.)
 *  - les littéraux string (`'...'`, avec `''` comme escape)
 *  - les commentaires ligne (`-- ...`) et bloc (`slash-star ... star-slash`)
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let i = 0
  let inString = false
  let inLineComment = false
  let inBlockComment = false
  let dollarTag = '' // tag du bloc dollar-quoted en cours (ex: '$$', '$func$')

  while (i < sql.length) {
    const char = sql[i]
    const next = sql[i + 1] ?? ''
    const rest = sql.slice(i)

    // Détection d'un tag dollar-quoted ($$ ou $nom$)
    if (!inString && !inLineComment && !inBlockComment) {
      const dollarMatch = rest.match(/^\$[A-Za-z0-9_]*\$/)
      if (dollarMatch) {
        const tag = dollarMatch[0]
        if (dollarTag) {
          // Fermeture d'un bloc
          if (tag === dollarTag) {
            current += tag
            i += tag.length
            dollarTag = ''
            continue
          }
        } else {
          // Ouverture d'un bloc
          dollarTag = tag
          current += tag
          i += tag.length
          continue
        }
      }
    }

    if (dollarTag) {
      // À l'intérieur d'un bloc dollar-quoted : tout passer tel quel
      current += char
      i += 1
      continue
    }

    if (inLineComment) {
      current += char
      if (char === '\n') inLineComment = false
      i += 1
      continue
    }

    if (inBlockComment) {
      current += char
      if (char === '*' && next === '/') {
        current += '/'
        i += 2
        inBlockComment = false
        continue
      }
      i += 1
      continue
    }

    if (inString) {
      current += char
      if (char === "'") {
        if (next === "'") {
          // Escape '' → on continue dans le string
          current += "'"
          i += 2
          continue
        }
        inString = false
      }
      i += 1
      continue
    }

    // Hors de tout contexte spécial
    if (char === '-' && next === '-') {
      inLineComment = true
      current += '--'
      i += 2
      continue
    }
    if (char === '/' && next === '*') {
      inBlockComment = true
      current += '/*'
      i += 2
      continue
    }
    if (char === "'") {
      inString = true
      current += char
      i += 1
      continue
    }
    if (char === ';') {
      const stmt = current.trim()
      if (stmt) statements.push(stmt)
      current = ''
      i += 1
      continue
    }

    current += char
    i += 1
  }

  const last = current.trim()
  if (last) statements.push(last)
  return statements
}

async function main() {
  const dir = join(process.cwd(), 'supabase')
  const files = (await readdir(dir))
    .filter((f) => f.endsWith('.sql'))
    .sort()

  if (files.length === 0) {
    console.log('Aucun fichier SQL trouvé dans supabase/')
    return
  }

  console.log(`\n▶ ${files.length} script(s) SQL à appliquer :\n`)
  for (const f of files) {
    const path = join(dir, f)
    const sql = (await readFile(path, 'utf8')).trim()
    if (!sql) {
      console.log(`  ⏭️  ${f} (vide, ignoré)`)
      continue
    }
    const statements = splitSqlStatements(sql)
    console.log(`  ⏳ Application de ${f} (${statements.length} statement(s))…`)
    try {
      for (const stmt of statements) {
        await db.$executeRawUnsafe(stmt)
      }
      console.log(`  ✓  ${f} appliqué`)
    } catch (err) {
      console.error(`  ✗  Échec ${f}:`, err instanceof Error ? err.message : err)
      throw err
    }
  }

  // Vérification RLS
  console.log('\n▶ Vérification RLS :')
  const result = (await db.$queryRawUnsafe(`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `)) as { tablename: string; rowsecurity: boolean }[]
  const withRls = result.filter((r) => r.rowsecurity)
  const withoutRls = result.filter((r) => !r.rowsecurity)
  console.log(`  Tables avec RLS : ${withRls.length}/${result.length}`)
  if (withoutRls.length) {
    console.log(`  ⚠️  Tables sans RLS :`)
    withoutRls.forEach((r) => console.log(`     - ${r.tablename}`))
  } else {
    console.log('  ✓ RLS activé sur toutes les tables')
  }
  console.log('')
}

main()
  .catch((e) => {
    console.error('\nFatal:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
