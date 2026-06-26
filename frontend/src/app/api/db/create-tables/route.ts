import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/auth-session'

const _postHandler = async () => {
  try {
    // Create Facture table
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Facture" (
        "id" TEXT NOT NULL,
        "numero" TEXT NOT NULL,
        "abonnementId" TEXT NOT NULL,
        "etablissementId" TEXT NOT NULL,
        "montantHt" DOUBLE PRECISION NOT NULL,
        "tva" DOUBLE PRECISION NOT NULL DEFAULT 20.0,
        "montantTtc" DOUBLE PRECISION NOT NULL,
        "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
        "dateEmission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "dateEcheance" TIMESTAMP(3) NOT NULL,
        "datePaiement" TIMESTAMP(3),
        "modePaiement" TEXT,
        "referencePaiement" TEXT,
        "lignes" TEXT NOT NULL,
        "notes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "Facture_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "Facture_numero_key" UNIQUE ("numero"),
        CONSTRAINT "Facture_abonnementId_fkey" FOREIGN KEY ("abonnementId") REFERENCES "Abonnement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "Facture_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );
    `)

    // Create NotificationAdmin table
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "NotificationAdmin" (
        "id" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "titre" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "destinataireId" TEXT,
        "destinataireRole" TEXT,
        "lu" BOOLEAN NOT NULL DEFAULT false,
        "actionUrl" TEXT,
        "actionLabel" TEXT,
        "priorite" TEXT NOT NULL DEFAULT 'NORMALE',
        "categorie" TEXT NOT NULL DEFAULT 'SYSTEME',
        "icone" TEXT,
        "expireLe" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "NotificationAdmin_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "NotificationAdmin_destinataireId_fkey" FOREIGN KEY ("destinataireId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );
    `)

    // Create MonitoringEvent table
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MonitoringEvent" (
        "id" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "severite" TEXT NOT NULL DEFAULT 'INFO',
        "message" TEXT NOT NULL,
        "details" TEXT,
        "source" TEXT,
        "duree" INTEGER,
        "statut" TEXT NOT NULL DEFAULT 'ACTIF',
        "resoluLe" TIMESTAMP(3),
        "resoluPar" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "MonitoringEvent_pkey" PRIMARY KEY ("id")
      );
    `)

    // Create IpWhitelist table
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "IpWhitelist" (
        "id" TEXT NOT NULL,
        "adresseIp" TEXT NOT NULL,
        "description" TEXT,
        "etablissementId" TEXT,
        "creePar" TEXT,
        "actif" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "IpWhitelist_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "IpWhitelist_adresseIp_key" UNIQUE ("adresseIp"),
        CONSTRAINT "IpWhitelist_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );
    `)

    return NextResponse.json({ success: true, message: 'Tables créées avec succès' })
  } catch (error) {
    console.error('Error creating tables:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export const POST = withAuth(_postHandler, ['ADMIN'])
