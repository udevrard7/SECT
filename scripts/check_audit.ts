import { db } from '../src/lib/db'

async function main() {
  // Check audit logs for LATH You Grâce Jessica
  const userId = 'cmq2flg0u0003oev78tihr4uu'
  
  const auditLogs = await db.auditLog.findMany({
    where: { 
      OR: [
        { entiteId: userId },
        { userId: userId }
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      action: true,
      entite: true,
      entiteId: true,
      details: true,
      createdAt: true,
      userEmail: true,
    },
  })
  
  console.log(`Found ${auditLogs.length} audit logs:`)
  for (const log of auditLogs) {
    console.log(`\n--- ${log.action} at ${log.createdAt.toISOString()} ---`)
    console.log(`By: ${log.userEmail}`)
    console.log(`Details: ${log.details}`)
  }
}

main().catch(console.error).finally(() => db.$disconnect())
