/**
 * Script : Réinitialisation des mots de passe enseignants et admins.
 *
 * Réinitialise TOUS les utilisateurs avec le rôle ENSEIGNANT ou ADMIN vers
 * un mot de passe temporaire commun, et force mustChangePwd = true pour
 * qu'ils soient obligés de le changer à la prochaine connexion.
 *
 * Usage : bun run scripts/reset-enseignant-admin-passwords.ts
 */
import { db } from '../src/lib/db'
import bcrypt from 'bcryptjs'

const TEMP_PASSWORD = 'SECT@Reset2026'

async function main() {
  console.log('\n🔒 Réinitialisation des mots de passe ENSEIGNANT et ADMIN\n')
  console.log('='.repeat(60))
  console.log(`Mot de passe temporaire : ${TEMP_PASSWORD}`)
  console.log(`Forçage changement au prochain login : OUI`)
  console.log('='.repeat(60) + '\n')

  const users = await db.user.findMany({
    where: {
      role: { in: ['ENSEIGNANT', 'ADMIN'] },
    },
    select: { id: true, email: true, name: true, role: true, actif: true },
    orderBy: { role: 'asc' },
  })

  console.log(`📊 ${users.length} utilisateur(s) trouvé(s) :\n`)

  const hashedPassword = await bcrypt.hash(TEMP_PASSWORD, 10)

  let count = 0
  for (const user of users) {
    await db.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePwd: true,
        loginAttempts: 0,
        lockedUntil: null,
      },
    })
    count++
    console.log(`  ✅ ${user.role.padEnd(11)} | ${user.email.padEnd(40)} | ${user.name}`)
  }

  console.log('\n' + '='.repeat(60))
  console.log(`🎉 ${count} mot(s) de passe réinitialisé(s) avec succès.`)
  console.log(`\n📌 Mot de passe temporaire pour TOUS : ${TEMP_PASSWORD}`)
  console.log(`📌 Chaque utilisateur devra le changer à sa prochaine connexion.`)
  console.log('='.repeat(60) + '\n')
}

main()
  .catch((e) => {
    console.error('❌ Erreur:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
