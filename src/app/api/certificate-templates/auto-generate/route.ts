import { NextRequest, NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { withAuth } from '@/lib/auth-session'
import { getAIProvider } from '@/lib/ai-providers/factory'

/**
 * POST /api/certificate-templates/auto-generate
 * Auto-suggests a certificate template (icon, colors, font) based on the UE's
 * description, code, and name.
 *
 * Body: { ueId?: string, mode?: 'rules' | 'ai' }
 *  - mode='rules' (default): instant keyword-based detection, no AI cost
 *  - mode='ai': uses the LLM for nuanced analysis (slower, ~3s)
 *
 * If ueId is provided, reads the UE from the DB. Otherwise, the caller must
 * provide description/code/nom in the body (for preview before UE exists).
 *
 * Returns: { template: { themeIcon, primaryColor, accentColor, fontFamily }, mode, source }
 */

interface TemplateSuggestion {
  themeIcon: string
  primaryColor: string
  accentColor: string
  fontFamily: string
}

// ─── Rule-based theme detection ───
// Each theme has: keywords (FR + EN), colors, font.
// Order matters: more specific themes first.
const THEME_RULES: Array<{
  icon: string
  primaryColor: string
  accentColor: string
  fontFamily: string
  keywords: string[]
}> = [
  // Code / Informatique
  {
    icon: 'code',
    primaryColor: '1A2540',   // navy
    accentColor: '8B5CF6',     // violet
    fontFamily: 'helvetica',
    keywords: [
      'programmation', 'programmer', 'code', 'coding', 'python', 'java', 'javascript',
      'typescript', 'algorithme', 'algorithm', 'informatique', 'computer', 'software',
      'logiciel', 'développement', 'developpement', 'development', 'web', 'html', 'css',
      'react', 'node', 'sql', 'base de données', 'base de donnees', 'database',
      'système', 'systeme', 'system', 'réseau', 'reseau', 'network',
      'intelligence artificielle', 'ia', 'ai', 'machine learning', 'deep learning',
      'génie logiciel', 'software engineering', 'compilation', 'compilateur',
      'unix', 'linux', 'shell', 'bash', 'git', 'api', 'framework',
      'bureautique', 'office', 'excel', 'word',
    ],
  },
  // Sciences (bio, chimie, physique) — note: "science" (singular) matches "sciences" as substring
  {
    icon: 'science',
    primaryColor: '0D9488',   // teal
    accentColor: '06B6D4',     // cyan
    fontFamily: 'helvetica',
    keywords: [
      'biologie', 'biology', 'chimie', 'chemistry', 'physique', 'physics',
      'science', 'laboratoire', 'lab', 'laboratory',
      'molécule', 'molecule', 'cellule', 'cell', 'génétique', 'genetic',
      'adn', 'dna', 'enzyme', 'protéine', 'protein',
      'thermodynamique', 'thermodynamics', 'quantique', 'quantum',
      'électromagnétisme', 'electromagnetism', 'optique', 'optics',
      'réaction', 'reaction', 'atome', 'atom', 'élément', 'element',
      'écologie', 'ecology', 'environnement', 'environment',
    ],
  },
  // Droit
  {
    icon: 'law',
    primaryColor: '7F1D1D',   // burgundy
    accentColor: 'DAA520',     // gold
    fontFamily: 'times',
    keywords: [
      'droit', 'law', 'juridique', 'legal', 'constitutionnel', 'constitutional',
      'loi', 'justice', 'contrat', 'contract', 'tribunal', 'court',
      'avocat', 'lawyer', 'jurisprudence', 'code civil', 'code pénal',
      'pénal', 'criminal', 'administratif', 'administrative',
      'contentieux', 'litigation', 'norme', 'regulation', 'réglementation',
      'responsabilité', 'liability', 'société', 'corporate',
    ],
  },
  // Économie / Gestion / Commerce
  {
    icon: 'business',
    primaryColor: 'B45309',   // amber-dark
    accentColor: 'EA580C',     // orange
    fontFamily: 'helvetica',
    keywords: [
      'économie', 'economie', 'economics', 'gestion', 'management',
      'commerce', 'business', 'finance', 'financial', 'marketing',
      'comptabilité', 'comptabilite', 'accounting', 'audit',
      'entreprise', 'strategy', 'stratégie',
      'vente', 'sales', 'negotiation', 'négociation',
      'logistique', 'logistics', 'supply chain', 'chaîne d\'approvisionnement',
      'ressources humaines', 'human resources', 'rh',
      'fiscalité', 'taxation', 'impôt', 'tax',
      'banque', 'banking', 'assurance', 'insurance',
      'bilan', 'budget', 'investissement', 'investment',
      // Specific composites to outweigh "science" false-positive in "Sciences Économiques"
      'sciences économiques', 'sciences de gestion', 'sciences économiques et de gestion',
      'économiques', 'économique', 'économiste',
    ],
  },
  // Mathématiques
  {
    icon: 'math',
    primaryColor: '3730A3',   // indigo
    accentColor: '3B82F6',     // blue
    fontFamily: 'times',
    keywords: [
      'mathématique', 'mathematique', 'mathematics', 'math', 'maths',
      'algèbre', 'algebre', 'algebra', 'analyse', 'analysis',
      'statistique', 'statistics', 'probabilité', 'probability',
      'calcul', 'calculus', 'géométrie', 'geometrie', 'geometry',
      'topologie', 'topology', 'intégrale', 'integral',
      'dérivée', 'derivative', 'matrice', 'matrix', 'vecteur', 'vector',
      'équation', 'equation', 'fonction', 'function',
      'logique', 'logic', 'ensemble', 'set theory',
      'arithmétique', 'arithmetic', 'nombre', 'number theory',
    ],
  },
  // Langues / Lettres
  {
    icon: 'language',
    primaryColor: 'BE185D',   // rose
    accentColor: 'EC4899',     // pink
    fontFamily: 'times',
    keywords: [
      'langue', 'language', 'anglais', 'english', 'français', 'francais',
      'french', 'espagnol', 'spanish', 'allemand', 'german',
      'lettres', 'letters', 'littérature', 'litterature', 'literature',
      'linguistique', 'linguistics', 'grammaire', 'grammar',
      'vocabulaire', 'vocabulary', 'traduction', 'translation',
      'expression écrite', 'writing', 'compréhension', 'comprehension',
      'phonétique', 'phonetics', 'sémantique', 'semantics',
      'civilisation', 'culture', 'poésie', 'poetry', 'roman', 'novel',
    ],
  },
  // Arts
  {
    icon: 'art',
    primaryColor: '7C3AED',   // purple
    accentColor: 'D946EF',     // fuchsia
    fontFamily: 'helvetica',
    keywords: [
      'art', 'arts', 'design', 'musique', 'music', 'peinture', 'painting',
      'sculpture', 'théâtre', 'theatre', 'theater', 'cinéma', 'cinema',
      'film', 'photographie', 'photography', 'dessin', 'drawing',
      'créatif', 'creative', 'création', 'creation',
      'esthétique', 'aesthetics', 'composition', 'œuvre', 'work of art',
      'graphisme', 'graphics', 'illustration', 'typographie', 'typography',
    ],
  },
]

const DEFAULT_THEME: TemplateSuggestion = {
  themeIcon: 'default',
  primaryColor: '1A4D2E',
  accentColor: 'DAA520',
  fontFamily: 'helvetica',
}

/**
 * Rule-based detection: count keyword matches per theme, pick the highest.
 * Returns the default theme if no keyword matches.
 */
function detectByRules(text: string): { suggestion: TemplateSuggestion; matchedTheme: string; score: number } {
  const lower = text.toLowerCase()
  let bestTheme = 'default'
  let bestScore = 0

  for (const rule of THEME_RULES) {
    let score = 0
    for (const kw of rule.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        // Weight longer keywords higher (more specific)
        score += kw.length > 8 ? 3 : kw.length > 4 ? 2 : 1
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestTheme = rule.icon
    }
  }

  if (bestScore === 0) {
    return { suggestion: DEFAULT_THEME, matchedTheme: 'default', score: 0 }
  }

  const matched = THEME_RULES.find((r) => r.icon === bestTheme)!
  return {
    suggestion: {
      themeIcon: matched.icon,
      primaryColor: matched.primaryColor,
      accentColor: matched.accentColor,
      fontFamily: matched.fontFamily,
    },
    matchedTheme: bestTheme,
    score: bestScore,
  }
}

/**
 * AI-based detection: ask the LLM to classify the UE into a theme and suggest colors.
 */
async function detectByAI(text: string): Promise<{ suggestion: TemplateSuggestion; raw: string }> {
  const provider = await getAIProvider()
  const validIcons = ['code', 'science', 'law', 'business', 'math', 'language', 'art', 'default']

  const systemPrompt = `Tu es un expert en design pédagogique. À partir de la description d'une Unité d'Enseignement (UE) universitaire, détermine le thème visuel le plus approprié pour son certificat.

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ou après:
{"themeIcon":"code","primaryColor":"1A2540","accentColor":"8B5CF6","fontFamily":"helvetica"}

- themeIcon: l'un de ${JSON.stringify(validIcons)} (choisis "default" si aucun ne correspond clairement)
- primaryColor: hex SANS #, couleur principale sobre (titres, bordures)
- accentColor: hex SANS #, couleur d'accent contrastée (lignes décoratives)
- fontFamily: "helvetica" (moderne/tech), "times" (classique/droit/lettres), ou "courier" (monospace/code)

Choisis les couleurs pour évoquer le domaine:
- Informatique/Code: navy + violet
- Sciences (bio/chimie/physique): teal + cyan
- Droit: burgundy + gold
- Économie/Gestion: amber + orange
- Mathématiques: indigo + blue
- Langues/Lettres: rose + pink
- Arts: purple + fuchsia
Ne mets aucun markdown, juste le JSON brut.`

  const response = await provider.chatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `UE: ${text.slice(0, 500)}` },
    ],
    temperature: 0.3,
  })

  const raw = response.choices?.[0]?.message?.content?.trim() || ''
  // Extract JSON
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  const jsonStr = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned
  const parsed = JSON.parse(jsonStr)

  // Validate
  const themeIcon = validIcons.includes(parsed.themeIcon) ? parsed.themeIcon : 'default'
  const isHex = (s: unknown) => typeof s === 'string' && /^[0-9a-fA-F]{6}$/.test(s.replace(/^#/, ''))
  const primaryColor = isHex(parsed.primaryColor) ? parsed.primaryColor.replace(/^#/, '') : DEFAULT_THEME.primaryColor
  const accentColor = isHex(parsed.accentColor) ? parsed.accentColor.replace(/^#/, '') : DEFAULT_THEME.accentColor
  const validFonts = ['helvetica', 'times', 'courier']
  const fontFamily = validFonts.includes(parsed.fontFamily) ? parsed.fontFamily : 'helvetica'

  return {
    suggestion: { themeIcon, primaryColor, accentColor, fontFamily },
    raw,
  }
}

async function _POST(
  request: NextRequest,
  _context: { params: unknown; user: { id: string; role: string; etablissementId: string | null } }
) {
  try {
    const body = await request.json().catch(() => ({}))
    const { ueId, mode = 'rules', description, code, nom } = body

    // Gather the text to analyze
    let text = ''
    let ueLabel = ''
    if (ueId) {
      const ue = await withRetry(() =>
        db.uniteEnseignement.findUnique({
          where: { id: ueId },
          select: { code: true, nom: true, description: true },
        })
      )
      if (!ue) {
        return NextResponse.json({ error: 'UE non trouvée.' }, { status: 404 })
      }
      text = [ue.code, ue.nom, ue.description || ''].filter(Boolean).join(' — ')
      ueLabel = `${ue.code} ${ue.nom}`
    } else {
      // Use provided fields
      text = [code, nom, description].filter(Boolean).join(' — ')
      ueLabel = `${code || ''} ${nom || ''}`.trim()
    }

    if (!text || text.trim().length < 3) {
      return NextResponse.json(
        { error: 'Description de l\'UE insuffisante pour l\'auto-génération.' },
        { status: 400 }
      )
    }

    // Always run rules first (instant, free, deterministic)
    const ruleResult = detectByRules(text)

    // If mode=ai OR rules found nothing, try AI for a more nuanced suggestion
    if (mode === 'ai' || ruleResult.score === 0) {
      try {
        const aiResult = await detectByAI(text)
        return NextResponse.json({
          template: aiResult.suggestion,
          mode,
          source: 'ai',
          ruleFallback: ruleResult.matchedTheme,
          ueLabel,
          message: ruleResult.score === 0
            ? 'Aucun mot-clé reconnu — suggestion générée par IA.'
            : 'Suggestion générée par IA.',
        })
      } catch (aiErr) {
        // AI failed — fall back to rules
        console.error('[auto-generate] AI failed, using rules:', aiErr instanceof Error ? aiErr.message : aiErr)
        return NextResponse.json({
          template: ruleResult.suggestion,
          mode,
          source: 'rules',
          matchedTheme: ruleResult.matchedTheme,
          score: ruleResult.score,
          ueLabel,
          message: 'IA indisponible — suggestion par règles appliquée.',
        })
      }
    }

    // Rules matched with confidence
    return NextResponse.json({
      template: ruleResult.suggestion,
      mode,
      source: 'rules',
      matchedTheme: ruleResult.matchedTheme,
      score: ruleResult.score,
      ueLabel,
      message: `Thème "${ruleResult.matchedTheme}" détecté par mots-clés (score: ${ruleResult.score}).`,
    })
  } catch (error) {
    console.error('Auto-generate template error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'auto-génération du template.' },
      { status: 500 }
    )
  }
}

// RESPONSABLE/ADMIN/ENSEIGNANT can auto-generate (read-only, no DB write)
export const POST = withAuth(_POST, ['ENSEIGNANT', 'RESPONSABLE', 'ADMIN'])
