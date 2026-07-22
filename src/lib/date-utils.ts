// formatDateUTC formate une date ISO (YYYY-MM-DD ou RFC3339) en DD/MM/YYYY
// SANS conversion timezone. Utile pour les colonnes DATE qui sont stockées
// sans timezone — éviter toLocaleDateString qui peut décaler d'un jour.
//
// SECT-ANNEE-DATE-COLUMN-1 : les colonnes AnneeAcademique.dateDebut/dateFin
// sont maintenant DATE (pas TIMESTAMP). Le backend renvoie YYYY-MM-DD.
// new Date('2026-09-01') en JS est interprété comme UTC minuit →
// toLocaleDateString('fr-FR') en UTC-5 affiche '31/08/2026' (décalage).
// Cette helper parse manuellement YYYY-MM-DD et retourne DD/MM/YYYY.
export function formatDateUTC(iso: string): string {
  if (!iso) return ''
  // Si format YYYY-MM-DD (10 chars), parser directement.
  if (iso.length >= 10) {
    const datePart = iso.slice(0, 10)
    const [year, month, day] = datePart.split('-')
    if (year && month && day) {
      return `${day}/${month}/${year}`
    }
  }
  // Fallback : parser comme Date et formater en UTC.
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const year = d.getUTCFullYear()
  return `${day}/${month}/${year}`
}
