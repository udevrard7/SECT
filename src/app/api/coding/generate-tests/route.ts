import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedHandler } from '@/lib/auth-session'
import { getZAI } from '@/lib/zai'
import { type CodingLanguage, type TestCase } from '@/lib/coding-types'

/**
 * POST /api/coding/generate-tests
 * Generate public + private unit tests for a coding question using AI.
 *
 * Body: {
 *   enonce: string,          // Problem description
 *   langage: CodingLanguage, // Programming language
 *   fonctionSignature: string, // e.g., "def calculer_moyenne(nombres):"
 *   codeModele?: string,     // Optional model solution for reference
 *   nombreTestsPublics?: number,  // Default: 4
 *   nombreTestsPrives?: number,   // Default: 8
 * }
 */
async function handler(
  request: NextRequest,
  context: { params: any; user: { id: string; email: string; name: string | null; role: string; actif: boolean; etablissementId: string | null; filiereId: string | null } }
) {
  try {
    const body = await request.json()
    const { enonce, langage, fonctionSignature, codeModele, nombreTestsPublics, nombreTestsPrives } = body as {
      enonce: string
      langage: CodingLanguage
      fonctionSignature: string
      codeModele?: string
      nombreTestsPublics?: number
      nombreTestsPrives?: number
    }

    if (!enonce || !langage || !fonctionSignature) {
      return NextResponse.json({ error: 'Énoncé, langage et signature de fonction requis' }, { status: 400 })
    }

    const nbPublics = nombreTestsPublics || 4
    const nbPrives = nombreTestsPrives || 8

    // Build the AI prompt
    const languageLabel = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', c: 'C', java: 'Java' }[langage] || langage

    const prompt = `Tu es un expert en pédagogie et en programmation ${languageLabel}. Génère des tests unitaires pour l'exercice de programmation suivant.

## Exercice
${enonce}

## Signature de la fonction
\`\`\`${langage}
${fonctionSignature}
\`\`\`

${codeModele ? `## Solution de référence\n\`\`\`${langage}\n${codeModele}\n\`\`\`\n` : ''}

## Consignes
Génère exactement ${nbPublics} tests publics et ${nbPrives} tests privés.

**Tests publics** (${nbPublics}) : visibles par l'étudiant pour l'auto-évaluation. Doivent couvrir des cas normaux simples.

**Tests privés** (${nbPrives}) : cachés, utilisés pour la notation finale. Doivent couvrir :
- Cas limites (valeurs extrêmes, entrées vides, valeurs nulles)
- Cas d'erreur (types incorrects, valeurs hors domaine)
- Cas de robustesse (grandes entrées, valeurs négatives)

Pour chaque test, fournis :
- **nom** : nom court descriptif (ex: "cas_normal_1", "cas_limite_vide", "cas_erreur_null")
- **entree** : les arguments d'entrée en format JSON (sera passé à la fonction)
- **sortieAttendue** : le résultat attendu sous forme de chaîne de caractères
- **description** : brève description du cas testé

## Format de réponse
Réponds UNIQUEMENT en JSON valide, sans markdown, sans commentaires :
{
  "testsPublics": [
    {"nom": "...", "entree": "...", "sortieAttendue": "...", "description": "..."}
  ],
  "testsPrives": [
    {"nom": "...", "entree": "...", "sortieAttendue": "...", "description": "..."}
  ]
}`

    const zai = await getZAI()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'Tu es un assistant spécialisé dans la génération de tests unitaires pour des exercices de programmation. Tu réponds UNIQUEMENT en JSON valide, sans markdown ni commentaires.',
        },
        { role: 'user', content: prompt },
      ],
      thinking: { type: 'disabled' },
    })

    const content = completion.choices?.[0]?.message?.content || ''

    // Parse the AI response - extract JSON from possible markdown wrapping
    let testsData: { testsPublics: TestCase[]; testsPrives: TestCase[] }
    try {
      // Try to extract JSON from markdown code block if present
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content]
      const jsonStr = jsonMatch[1] || content
      testsData = JSON.parse(jsonStr.trim())
    } catch (parseError) {
      console.error('[generate-tests] Failed to parse AI response:', content.slice(0, 500))
      return NextResponse.json(
        { error: 'Erreur lors du parsing de la réponse IA. Veuillez réessayer.' },
        { status: 500 }
      )
    }

    // Validate the structure
    if (!Array.isArray(testsData.testsPublics) || !Array.isArray(testsData.testsPrives)) {
      return NextResponse.json(
        { error: 'Structure de tests invalide générée par l\'IA' },
        { status: 500 }
      )
    }

    // Ensure each test has required fields
    const sanitizeTests = (tests: TestCase[]): TestCase[] =>
      tests.map(t => ({
        nom: t.nom || 'Test sans nom',
        entree: typeof t.entree === 'string' ? t.entree : JSON.stringify(t.entree),
        sortieAttendue: typeof t.sortieAttendue === 'string' ? t.sortieAttendue : JSON.stringify(t.sortieAttendue),
        description: t.description || '',
      }))

    return NextResponse.json({
      testsPublics: sanitizeTests(testsData.testsPublics),
      testsPrives: sanitizeTests(testsData.testsPrives),
    })
  } catch (error) {
    console.error('[generate-tests] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la génération des tests' },
      { status: 500 }
    )
  }
}

export const POST = withAuth(handler, ['ENSEIGNANT', 'ADMIN', 'RESPONSABLE'])
