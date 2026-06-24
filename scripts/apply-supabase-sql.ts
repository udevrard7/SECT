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
 * Pour ajouter un nouveau script SQL, déposer un fichier `supabase/*.sql`.
 */
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { db } from '../src/lib/db'

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
    console.log(`  ⏳ Application de ${f}…`)
    try {
      await db.$executeRawUnsafe(sql)
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
