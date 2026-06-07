import { db } from '../src/lib/db'

async function main() {
  const user = await db.user.findFirst({
    where: { email: { contains: 'lath.you', mode: 'insensitive' } },
    select: {
      id: true,
      email: true,
      name: true,
      matricule: true,
      role: true,
      actif: true,
      loginAttempts: true,
      lockedUntil: true,
      mustChangePwd: true,
      derniereConnexion: true,
    },
  })
  
  if (!user) {
    console.log('User not found with email containing lath.you')
    
    const byName = await db.user.findFirst({
      where: { name: { contains: 'LATH', mode: 'insensitive' } },
      select: {
        id: true,
        email: true,
        name: true,
        matricule: true,
        role: true,
        actif: true,
        loginAttempts: true,
        lockedUntil: true,
        mustChangePwd: true,
        derniereConnexion: true,
      },
    })
    
    if (byName) {
      console.log('Found by name:', JSON.stringify(byName, null, 2))
    } else {
      console.log('Also not found by name LATH')
    }
    return
  }
  
  console.log('User found:')
  console.log(JSON.stringify(user, null, 2))
}

main().catch(console.error).finally(() => db.$disconnect())
