/**
 * Matricule Generator Utility.
 *
 * Generates student matricules based on the format defined in the
 * Etablissement configuration. Supports sequential counters.
 *
 * Format patterns:
 *  - {YYYY} → current year (4 digits)
 *  - {YY}   → current year (2 digits)
 *  - {FIL}  → filière code
 *  - {NIV}  → niveau (e.g. L1, L2, L3, M1, M2)
 *  - {NNN}  → sequential counter (padded)
 *  - {NN}   → sequential counter (2 digits padded)
 *  - {CODE} → établissement code (first 4 chars of name, uppercase)
 *
 * If no format is defined, generates: ETU-XXXXXXXX (random alphanumeric)
 */

export function generateMatricule(options: {
  format?: string | null
  etablissementNom?: string
  filiereCode?: string | null
  niveau?: string | null
  counter?: number
  existingMatricules?: string[]
}): { matricule: string; nextCounter: number } {
  const { format, etablissementNom = '', filiereCode, niveau, counter = 1, existingMatricules = [] } = options

  // If no format, generate a default matricule
  if (!format || format.trim() === '') {
    return generateDefaultMatricule(existingMatricules)
  }

  const year = new Date().getFullYear()
  const shortYear = String(year).slice(-2)
  const code = etablissementNom.substring(0, 4).toUpperCase().replace(/[^A-Z]/g, 'X')

  // Build matricule from format
  let matricule = format
    .replace(/\{YYYY\}/g, String(year))
    .replace(/\{YY\}/g, shortYear)
    .replace(/\{FIL\}/gi, filiereCode || 'XXX')
    .replace(/\{NIV\}/g, niveau || 'X')
    .replace(/\{CODE\}/g, code)
    .replace(/\{NNNN\}/g, String(counter).padStart(4, '0'))
    .replace(/\{NNN\}/g, String(counter).padStart(3, '0'))
    .replace(/\{NN\}/g, String(counter).padStart(2, '0'))

  // Ensure uniqueness
  const finalMatricule = ensureUnique(matricule, existingMatricules)
  return { matricule: finalMatricule, nextCounter: counter + 1 }
}

function generateDefaultMatricule(existingMatricules: string[]): { matricule: string; nextCounter: number } {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = 'ETU-'
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  const finalMatricule = ensureUnique(result, existingMatricules)
  return { matricule: finalMatricule, nextCounter: 0 }
}

function ensureUnique(matricule: string, existing: string[]): string {
  if (!existing.includes(matricule)) return matricule

  // Try appending counter
  let i = 2
  let candidate = `${matricule}-${i}`
  while (existing.includes(candidate) && i < 100) {
    i++
    candidate = `${matricule}-${i}`
  }
  return candidate
}

/**
 * Validate a matricule against a regex pattern.
 */
export function validateMatricule(matricule: string, regexPattern?: string | null): {
  valid: boolean
  error?: string
} {
  if (!regexPattern || regexPattern.trim() === '') {
    return { valid: true }
  }

  try {
    const regex = new RegExp(regexPattern)
    if (!regex.test(matricule)) {
      return {
        valid: false,
        error: `Le matricule ne correspond pas au format attendu. Exemple de format valide : pattern "${regexPattern}"`,
      }
    }
    return { valid: true }
  } catch {
    // If regex is invalid, skip validation
    return { valid: true }
  }
}
