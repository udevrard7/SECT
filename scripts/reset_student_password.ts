import { db } from '../src/lib/db'
import bcrypt from 'bcryptjs'

async function main() {
  const userId = 'cmq2flg0u0003oev78tihr4uu'
  const newTempPassword = 'Jessica@2024'
  
  // Hash the new password
  const hashedPassword = await bcrypt.hash(newTempPassword, 10)
  
  // Update the user
  const updated = await db.user.update({
    where: { id: userId },
    data: {
      password: hashedPassword,
      mustChangePwd: true,
      loginAttempts: 0,
      lockedUntil: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      matricule: true,
      mustChangePwd: true,
      actif: true,
    },
  })
  
  console.log('Password reset successful!')
  console.log('User:', JSON.stringify(updated, null, 2))
  console.log('\n--- New credentials ---')
  console.log(`Matricule: ${updated.matricule}`)
  console.log(`Temp password: ${newTempPassword}`)
  console.log(`Must change password on next login: ${updated.mustChangePwd}`)
  
  // Create audit log
  await db.auditLog.create({
    data: {
      action: 'PASSWORD_RESET',
      entite: 'User',
      entiteId: userId,
      details: JSON.stringify({
        reason: 'Réinitialisation mot de passe après changement matricule',
        matricule: updated.matricule,
        mustChangePwd: true,
      }),
    },
  })
  
  console.log('\nAudit log created.')
}

main().catch(console.error).finally(() => db.$disconnect())
