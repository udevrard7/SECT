import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function POST() {
  try {
    // Check if users already exist
    const existingUsers = await db.user.count()

    if (existingUsers > 0) {
      return NextResponse.json(
        { message: 'La base de données contient déjà des données', count: existingUsers },
        { status: 200 }
      )
    }

    const saltRounds = 10

    // Create demo users
    const users = await Promise.all([
      db.user.create({
        data: {
          email: 'admin@sect.fr',
          name: 'Jean Dupont',
          password: await bcrypt.hash('admin123', saltRounds),
          role: 'ADMIN',
          etablissement: 'Université SECT',
        },
      }),
      db.user.create({
        data: {
          email: 'responsable@sect.fr',
          name: 'Marie Laurent',
          password: await bcrypt.hash('resp123', saltRounds),
          role: 'RESPONSABLE',
          etablissement: 'Université SECT',
          filiere: 'Informatique',
        },
      }),
      db.user.create({
        data: {
          email: 'enseignant@sect.fr',
          name: 'Pierre Martin',
          password: await bcrypt.hash('ens123', saltRounds),
          role: 'ENSEIGNANT',
          etablissement: 'Université SECT',
          filiere: 'Informatique',
        },
      }),
      db.user.create({
        data: {
          email: 'etudiant@sect.fr',
          name: 'Sophie Bernard',
          password: await bcrypt.hash('etu123', saltRounds),
          role: 'ETUDIANT',
          etablissement: 'Université SECT',
          filiere: 'Informatique L2',
        },
      }),
    ])

    return NextResponse.json({
      message: 'Données de démonstration créées avec succès',
      users: users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role })),
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création des données' },
      { status: 500 }
    )
  }
}
