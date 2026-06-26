/**
 * Migration des données Supabase → Neon (sous-étape 1.C) — version optimisée
 *
 * Améliorations vs v1 :
 * - INSERT multi-valeurs par batch (100 lignes/statement au lieu de 1)
 * - Sortie redirigée vers fichier (pour exécution longue sans timeout)
 *
 * Usage : bun run scripts/migrate-data-to-neon.ts
 */
import pg from 'pg'
import { readFileSync, writeFileSync } from 'fs'

const SUPA_URL = "postgresql://postgres.gnicihntcisgkkkuwolx:Victoire%401993%23@aws-1-eu-central-1.pooler.supabase.com:5432/postgres"
const NEON_URL = "postgresql://neondb_owner:npg_O1hsIlNtP0nx@ep-muddy-river-asz862wj.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require"

const TABLES = [
  'Plan', 'PlatformSettings', 'AIProviderConfig', 'AIFailoverEvent',
  'Etablissement', 'EtablissementAccess', 'SecuritySettings', 'AnneeAcademique',
  'Filiere', 'UniteEnseignement', 'UniteEnseignementFiliere', 'EnseignantFiliere',
  'Affectation', 'User', 'Invitation', 'PasswordReset', 'PushSubscription',
  'Document', 'Chapter', 'Question', 'Epreuve', 'EpreuveQuestion', 'EpreuveDocument',
  'Devoir', 'GrilleEvaluation',
  'SessionPassation', 'Reponse', 'Resultat', 'Soumission', 'Certificat',
  'ValidationUE', 'SessionSpeciale',
  'BadgeDefinition', 'BadgeProgression',
  'ChatThread', 'ChatMessage', 'ReviewItem', 'Flashcard', 'StudySession',
  'PracticeAttempt', 'HelpThread', 'HelpMessage',
  'Abonnement', 'Facture', 'NotificationAdmin', 'MonitoringEvent', 'IpWhitelist',
  'AuditLog', 'Alerte',
]

const BATCH_SIZE = 100
const LOG_FILE = '/home/z/my-project/scripts/migration-log.txt'

const log: string[] = []
function out(msg: string) { log.push(msg); console.log(msg) }

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function splitStatements(sql: string): string[] {
  const statements: string[] = []
  let current = '', i = 0, dollarTag = '', inString = false
  while (i < sql.length) {
    const char = sql[i], rest = sql.slice(i)
    const dollarMatch = rest.match(/^\$(\w*)\$/)
    if (dollarMatch) {
      const tag = dollarMatch[0]
      if (dollarTag === '') { dollarTag = tag; current += tag; i += tag.length; continue }
      else if (tag === dollarTag) { dollarTag = ''; current += tag; i += tag.length; continue }
    }
    if (dollarTag !== '') { current += char; i++; continue }
    if (char === "'" && sql[i-1] !== '\\') inString = !inString
    if (char === ';' && !inString) {
      current += char; const trimmed = current.trim()
      if (trimmed && !trimmed.startsWith('--')) statements.push(trimmed)
      current = ''; i++; continue
    }
    if (char === '-' && sql[i+1] === '-' && !inString) { while (i < sql.length && sql[i] !== '\n') i++; continue }
    current += char; i++
  }
  const trimmed = current.trim()
  if (trimmed && !trimmed.startsWith('--')) statements.push(trimmed)
  return statements
}

async function main() {
  out("=== Migration des données Supabase → Neon ===\n")

  const supa = new pg.Client({ connectionString: SUPA_URL, ssl: { rejectUnauthorized: false } })
  const neon = new pg.Client({ connectionString: NEON_URL, ssl: { rejectUnauthorized: false } })

  await supa.connect()
  out("✅ Connecté à Supabase (source)")
  await neon.connect()
  out("✅ Connecté à Neon (cible)\n")

  out("=== Configuration session Neon ===")
  await neon.query("SET row_security = off")
  out("  SET row_security = off (bypass RLS)")

  const allTablesRes = await neon.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)
  for (const row of allTablesRes.rows) {
    await neon.query(`ALTER TABLE public.${quoteIdent(row.tablename)} DISABLE TRIGGER USER`)
  }
  out(`  DISABLE TRIGGER USER sur ${allTablesRes.rows.length} tables`)

  const fkRes = await neon.query(`
    SELECT conname, conrelid::regclass AS table_name
    FROM pg_constraint JOIN pg_namespace n ON n.oid = connamespace
    WHERE n.nspname = 'public' AND contype = 'f'
  `)
  out(`  Drop de ${fkRes.rows.length} contraintes FK...`)
  for (const row of fkRes.rows) {
    await neon.query(`ALTER TABLE ${row.table_name} DROP CONSTRAINT IF EXISTS ${quoteIdent(row.conname)}`)
  }
  out("  FK constraints dropped\n")

  let totalMigrated = 0
  let totalSkipped = 0
  const results: { table: string; supa: number; neon: number; status: string }[] = []

  for (const table of TABLES) {
    const q = quoteIdent(table)
    try {
      const countRes = await supa.query(`SELECT count(*) FROM ${q}`)
      const supaCount = parseInt(countRes.rows[0].count, 10)

      if (supaCount === 0) {
        out(`▶ ${table.padEnd(35)} (vide — ignoré)`)
        totalSkipped++
        results.push({ table, supa: 0, neon: 0, status: "skipped" })
        continue
      }

      const colsRes = await supa.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table])
      const columns = colsRes.rows.map((r: any) => r.column_name as string)
      const colList = columns.map(quoteIdent).join(', ')

      const dataRes = await supa.query(`SELECT ${colList} FROM ${q}`)
      const rows = dataRes.rows

      await neon.query(`DELETE FROM ${q}`)

      // INSERT multi-valeurs par batch
      if (rows.length > 0) {
        const placeholdersPerRow = `(${columns.map((_, i) => `$${i + 1}`).join(', ')})`
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE)
          // Construire un INSERT multi-valeurs: VALUES ($1,...),($N+1,...),...
          const valueGroups: string[] = []
          const allValues: any[] = []
          let paramIdx = 1
          for (const row of batch) {
            const phs: string[] = []
            for (const col of columns) {
              phs.push(`$${paramIdx++}`)
              allValues.push(row[col] ?? null)
            }
            valueGroups.push(`(${phs.join(', ')})`)
          }
          const insertSql = `INSERT INTO ${q} (${colList}) VALUES ${valueGroups.join(', ')}`
          await neon.query(insertSql, allValues)
        }
      }

      const neonCountRes = await neon.query(`SELECT count(*) FROM ${q}`)
      const neonCount = parseInt(neonCountRes.rows[0].count, 10)
      const status = neonCount === supaCount ? "✅" : "❌ MISMATCH"
      out(`▶ ${table.padEnd(35)} ${supaCount} → ${neonCount} ${status}`)
      totalMigrated += neonCount
      results.push({ table, supa: supaCount, neon: neonCount, status })
    } catch (e: any) {
      out(`▶ ${table.padEnd(35)} ❌ ERREUR: ${e.message}`)
      results.push({ table, supa: -1, neon: -1, status: `ERROR: ${e.message}` })
    }
  }

  out("\n=== Restore des contraintes FK ===")
  const fkSql = readFileSync('/home/z/my-project/db/migrations/000004_add_foreign_keys.up.sql', 'utf8')
  const fkStmts = splitStatements(fkSql)
  out(`  Re-adding ${fkStmts.length} FK constraints from migration 000004...`)
  for (const stmt of fkStmts) {
    await neon.query(stmt)
  }
  out(`  ✅ ${fkStmts.length} FK constraints restored`)

  out("\n=== Restore triggers + RLS ===")
  for (const row of allTablesRes.rows) {
    await neon.query(`ALTER TABLE public.${quoteIdent(row.tablename)} ENABLE TRIGGER USER`)
  }
  out(`  ENABLE TRIGGER USER sur ${allTablesRes.rows.length} tables`)
  await neon.query("SET row_security = on")
  out("  SET row_security = on (RLS réactivé)\n")

  out("=== Résumé de la migration ===")
  out(`Tables migrées avec succès : ${results.filter(r => r.status === "✅").length}`)
  out(`Tables ignorées (vides)   : ${totalSkipped}`)
  out(`Tables en erreur          : ${results.filter(r => r.status.startsWith("ERROR")).length}`)
  out(`Total lignes migrées      : ${totalMigrated}`)

  const mismatches = results.filter(r => r.status === "❌ MISMATCH")
  if (mismatches.length > 0) {
    out("\n⚠️  Mismatches :")
    mismatches.forEach(m => out(`  ${m.table}: Supabase=${m.supa} Neon=${m.neon}`))
  }
  const errors = results.filter(r => r.status.startsWith("ERROR"))
  if (errors.length > 0) {
    out("\n❌ Erreurs :")
    errors.forEach(e => out(`  ${e.table}: ${e.status}`))
  }

  await supa.end()
  await neon.end()

  writeFileSync(LOG_FILE, log.join('\n'))
  out(`\n📄 Log sauvegardé dans ${LOG_FILE}`)

  if (errors.length > 0) process.exit(1)
  out("\n✅ Migration terminée avec succès!")
}

main().catch(e => {
  out(`\n❌ FATAL: ${e.message}`)
  writeFileSync(LOG_FILE, log.join('\n'))
  process.exit(1)
})
