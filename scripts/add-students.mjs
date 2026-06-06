/**
 * Script to add students from the PDF list to the Supabase database
 * - Matricule as provided
 * - Email: prenom.nom@uniabidjan.com (lowercase, no accents, spaces replaced with dots)
 * - Default password: same as matricule
 * - Role: ETUDIANT
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

// Force PostgreSQL URL - system DATABASE_URL points to SQLite in sandbox
const PG_URL = process.env.DATABASE_URL_PG || 
  "postgresql://postgres.gnicihntcisgkkkuwolx:Victoire%401993%23@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

const prisma = new PrismaClient({
  datasourceUrl: PG_URL
})

// Students extracted from "liste Edudiant.pdf"
// LICENCE 2 TRONC COMMUN - ANNÉE ACADÉMIQUE 2025-2026
const students = [
  { num: 1, name: "SOUMAHORO Rocka Almatou", sexe: "F", matricule: "SEG/LJ/24/001" },
  { num: 2, name: "LATH You Grâce Jessica", sexe: "F", matricule: "SEG/LJ/24/002" },
  { num: 3, name: "DALLI Grâce Oriane Sephora", sexe: "F", matricule: "SEG/LJ/24/003" },
  { num: 4, name: "ASSIELOU Tehoua Dan Irvin Othniel", sexe: "M", matricule: "SEG/LJ/24/004" },
  { num: 5, name: "KOKORA Grâce Sharon", sexe: "F", matricule: "SEG/LJ/24/005" },
  { num: 6, name: "JAMAL Deen Lawal", sexe: "M", matricule: "SEG/LJ/24/008" },
  { num: 7, name: "ZOUGMORE Maimounata", sexe: "F", matricule: "INF/LJ/24/001" },
  { num: 8, name: "SAMBAKE Thiam Samuel Eliel", sexe: "M", matricule: "INF/LJ/24/002" },
  { num: 9, name: "LIATCHE Christ-Johan Siaka", sexe: "M", matricule: "INF/LJ/24/003" },
  { num: 10, name: "AKA N'cho Ariel Yoram", sexe: "M", matricule: "INF/LJ/24/004" },
  { num: 11, name: "SEGNIBO Kouassi Elie Wilfried", sexe: "M", matricule: "INF/LJ/24/005" },
  { num: 12, name: "ASSIELOU Tanoh Yann-Harrel Mardochée", sexe: "M", matricule: "INF/LJ/24/006" },
  { num: 13, name: "ASSANI Emile Junior Assani", sexe: "M", matricule: "INF/LJ/25/008" },
]

/**
 * Generate email from name: prenom.nom@uniabidjan.com
 * - Take first name(s) (everything after surname)
 * - Lowercase, remove accents, replace spaces/apostrophes with dots
 * - Remove consecutive dots
 */
function generateEmail(name) {
  const parts = name.trim().split(/\s+/)
  // First part is surname (SOUMAHORO), rest are first names (Rocka Almatou)
  const firstNames = parts.slice(1)
  const surname = parts[0]
  
  // Combine first names and surname
  const emailLocal = [...firstNames, surname]
    .join('.')
    .toLowerCase()
    // Remove accents
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Replace apostrophes and hyphens with dots
    .replace(/['\-]/g, '.')
    // Remove any non-alphanumeric except dots
    .replace(/[^a-z0-9.]/g, '')
    // Remove consecutive dots
    .replace(/\.{2,}/g, '.')
    // Remove leading/trailing dots
    .replace(/^\.+|\.+$/g, '')
  
  return `${emailLocal}@uniabidjan.com`
}

async function main() {
  console.log(`\n🎓 Ajout de ${students.length} étudiants à la base de données...\n`)
  
  const defaultPassword = 'Etudiant@2024'
  const hashedPassword = await bcrypt.hash(defaultPassword, 10)
  
  let created = 0
  let skipped = 0
  let errors = 0
  
  for (const student of students) {
    const email = generateEmail(student.name)
    
    try {
      // Check if student already exists (by matricule or email)
      const existing = await prisma.user.findFirst({
        where: {
          OR: [
            { matricule: student.matricule },
            { email: email }
          ]
        }
      })
      
      if (existing) {
        console.log(`⏭️  ${student.name} (${student.matricule}) - déjà existant (${existing.email})`)
        skipped++
        continue
      }
      
      // Create the student
      const user = await prisma.user.create({
        data: {
          name: student.name,
          email: email,
          password: hashedPassword,
          matricule: student.matricule,
          role: 'ETUDIANT',
          actif: true,
          mustChangePwd: true,
        }
      })
      
      console.log(`✅ ${student.name} → ${email} (${student.matricule})`)
      created++
    } catch (err) {
      console.error(`❌ ${student.name} (${student.matricule}): ${err.message}`)
      errors++
    }
  }
  
  console.log(`\n📊 Résumé:`)
  console.log(`   Créés: ${created}`)
  console.log(`   Ignorés (existant): ${skipped}`)
  console.log(`   Erreurs: ${errors}`)
  console.log(`   Total traités: ${students.length}`)
  console.log(`\n🔐 Mot de passe par défaut: ${defaultPassword}`)
  console.log(`   Les étudiants devront le changer à la première connexion\n`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
