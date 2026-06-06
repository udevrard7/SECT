import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAIProvider } from '@/lib/ai-providers'
import { requireRole, isAuthError } from '@/lib/auth-middleware'

// Extend Vercel function timeout to 300s for large AI generation (50+ questions can take several minutes)
export const maxDuration = 300

// ─── Constants ───

/** Maximum questions per AI batch to avoid response truncation */
const MAX_QUESTIONS_PER_BATCH = 8

/** Token estimates per question type (output tokens) — generous estimates for reliability */
const TOKEN_ESTIMATES = {
  QCU: 400,
  QCM: 500,
  QRC: 600,
  REFLEXION: 1500,
}

/** Maximum output tokens per batch — most modern models support 16k+ */
const MAX_BATCH_TOKENS = 16384

/** Minimum output tokens per batch */
const MIN_BATCH_TOKENS = 4096

/** Base content chars per question for dynamic content limit */
const CONTENT_CHARS_PER_QUESTION = 800

/** Minimum content chars */
const MIN_CONTENT_CHARS = 10000

/** Maximum content chars (hard cap to avoid prompt overflow) */
const MAX_CONTENT_CHARS_HARD = 30000

/** Maximum retry attempts for a failed batch */
const MAX_BATCH_RETRIES = 3

// ─── Types ───

interface GenerateExamRequest {
  documentIds: string[]
  enseignantId: string
  config: {
    titre?: string
    difficulte?: string
    nbQuestions?: number
    duree?: number
    typesQuestions?: {
      qcu?: number
      qcm?: number
      qrc?: number
      reflexion?: number
    }
    langue?: string
    themes?: string[]
    tonPedagogique?: string
    themesExclus?: string[]
    consignes?: string
    filiereId?: string
    uniteEnseignementId?: string
    noteTotal?: number
    niveau?: string
  }
  preview?: boolean // If true, return generated content without saving to DB
}

// ─── Difficulty Distribution ───

/**
 * Get a realistic difficulty distribution centered on the selected difficulty level.
 * Instead of always using 30/40/20/10, we shift the distribution around the target.
 */
function getDifficulteDistribution(difficulte: string): string {
  const distributions: Record<string, string> = {
    FACILE: 'environ 60% FACILE, 25% MOYEN, 10% DIFFICILE, 5% EXPERT',
    MOYEN: 'environ 15% FACILE, 50% MOYEN, 25% DIFFICILE, 10% EXPERT',
    DIFFICILE: 'environ 5% FACILE, 15% MOYEN, 50% DIFFICILE, 30% EXPERT',
    EXPERT: 'environ 5% FACILE, 10% MOYEN, 25% DIFFICILE, 60% EXPERT',
  }
  return distributions[difficulte] || distributions['MOYEN']
}

interface BatchSpec {
  type: 'QCU' | 'QCM' | 'QRC' | 'REFLEXION'
  count: number
}

// ─── Smart Batch Planner ───

/**
 * Plan generation batches intelligently.
 * Each batch targets MAX_QUESTIONS_PER_BATCH questions max.
 * Groups QCU+QCM together (both are objective/choice questions).
 * QRC and REFLEXION get their own batches (open-ended, more tokens).
 * If a type exceeds MAX_QUESTIONS_PER_BATCH, split it into multiple batches.
 */
function planBatches(
  nbQCU: number,
  nbQCM: number,
  nbQRC: number,
  nbREFLEXION: number
): BatchSpec[][] {
  const batches: BatchSpec[][] = []

  // ─── Phase 1: QCU + QCM (objective questions) ───
  // Combine QCU and QCM into batches, splitting when exceeding MAX_QUESTIONS_PER_BATCH
  let remainingQCU = nbQCU
  let remainingQCM = nbQCM

  while (remainingQCU > 0 || remainingQCM > 0) {
    const batch: BatchSpec[] = []
    let slotsUsed = 0

    // Fill with QCU first
    if (remainingQCU > 0) {
      const qcuInBatch = Math.min(remainingQCU, MAX_QUESTIONS_PER_BATCH - slotsUsed)
      batch.push({ type: 'QCU', count: qcuInBatch })
      slotsUsed += qcuInBatch
      remainingQCU -= qcuInBatch
    }

    // Fill remaining slots with QCM
    if (remainingQCM > 0 && slotsUsed < MAX_QUESTIONS_PER_BATCH) {
      const qcmInBatch = Math.min(remainingQCM, MAX_QUESTIONS_PER_BATCH - slotsUsed)
      batch.push({ type: 'QCM', count: qcmInBatch })
      slotsUsed += qcmInBatch
      remainingQCM -= qcmInBatch
    }

    batches.push(batch)
  }

  // ─── Phase 2: QRC (short answer) ───
  let remainingQRC = nbQRC
  while (remainingQRC > 0) {
    const count = Math.min(remainingQRC, MAX_QUESTIONS_PER_BATCH)
    batches.push([{ type: 'QRC', count }])
    remainingQRC -= count
  }

  // ─── Phase 3: REFLEXION (essay/problem) ───
  // REFLEXION questions are token-heavy; limit to 4 per batch for better reliability
  let remainingREFLEXION = nbREFLEXION
  while (remainingREFLEXION > 0) {
    const count = Math.min(remainingREFLEXION, 4) // 4 max per batch for REFLEXION
    batches.push([{ type: 'REFLEXION', count }])
    remainingREFLEXION -= count
  }

  return batches
}

/**
 * Calculate maxTokens for a batch based on its composition.
 */
function calculateBatchTokens(batch: BatchSpec[]): number {
  const estimated = batch.reduce((sum, spec) => {
    return sum + spec.count * (TOKEN_ESTIMATES[spec.type] || 500)
  }, 500) // +500 for JSON structure overhead
  return Math.min(MAX_BATCH_TOKENS, Math.max(MIN_BATCH_TOKENS, estimated))
}

/**
 * Build the question specification string for a batch.
 */
function buildBatchSpec(batch: BatchSpec[]): string {
  const parts: string[] = []
  for (const spec of batch) {
    switch (spec.type) {
      case 'QCU':
        parts.push(`- ${spec.count} question(s) QCU (Choix Unique)`)
        break
      case 'QCM':
        parts.push(`- ${spec.count} question(s) QCM (Choix Multiples)`)
        break
      case 'QRC':
        parts.push(`- ${spec.count} question(s) QRC (Réponse Courte)`)
        break
      case 'REFLEXION':
        parts.push(`- ${spec.count} question(s) REFLEXION (Mini sujet de réflexion avec guide de correction détaillé)`)
        break
    }
  }
  return parts.join('\n')
}

// ─── Core Generation ───

/**
 * Generate exam questions using smart batch splitting.
 * Each batch is small enough to avoid AI response truncation.
 * Includes retry logic for failed batches.
 */
async function generateInBatches(
  aiProvider: Awaited<ReturnType<typeof getAIProvider>>,
  fullPrompt: string,
  nbQCU: number,
  nbQCM: number,
  nbQRC: number,
  nbREFLEXION: number,
  difficulte: string,
  langue: string,
  config: GenerateExamRequest['config']
): Promise<{ choices: Array<{ message: { content: string } }> }> {
  // Extract the document content part from the full prompt (between """ markers)
  const docMatch = fullPrompt.match(/Documents sources:\n"""([\s\S]*?)"""/)
  const docContent = docMatch ? docMatch[1] : ''

  const allQuestions: Record<string, unknown>[] = []
  let examTitre = ''
  let examDescription = ''
  let examConsignes = ''

  const makeBatchPrompt = (questionSpec: string, existingQuestions: number, batchIndex: number, totalBatches: number) => {
    const isFirstBatch = batchIndex === 0
    const diffDistribution = getDifficulteDistribution(difficulte)

    // Build difficulty enforcement instructions
    const diffInstructions: Record<string, string> = {
      FACILE: `CRITIQUE: Le niveau demandé est FACILE. Au moins 60% des questions doivent avoir difficulte="FACILE". Le reste doit être MOYEN (25%) ou DIFFICILE (15%). Ne génère PAS de questions EXPERT.`,
      MOYEN: `CRITIQUE: Le niveau demandé est MOYEN. Au moins 50% des questions doivent avoir difficulte="MOYEN". Répartis le reste: ~15% FACILE, ~25% DIFFICILE, ~10% EXPERT. Ne génère PAS principalement des questions FACILE.`,
      DIFFICILE: `CRITIQUE: Le niveau demandé est DIFFICILE. Au moins 50% des questions doivent avoir difficulte="DIFFICILE". Répartis le reste: ~5% FACILE, ~15% MOYEN, ~30% EXPERT. Ne génère PAS principalement des questions FACILE ou MOYEN.`,
      EXPERT: `CRITIQUE: Le niveau demandé est EXPERT. Au moins 60% des questions doivent avoir difficulte="EXPERT". Répartis le reste: ~5% FACILE, ~10% MOYEN, ~25% DIFFICILE. Ne génère PAS principalement des questions FACILE ou MOYEN.`,
    }

    // Build UE classification instructions
    const ueInstructions = config?.uniteEnseignementId
      ? `\n- OBLIGATOIRE: Chaque question DOIT avoir ueCode et ueNom correspondant à l'UE cible sélectionnée. Si le contenu couvre plusieurs UE, classe chaque question dans l'UE la plus pertinente.`
      : `\n- OBLIGATOIRE: Chaque question DOIT avoir ueCode et ueNom identifiant l'Unité d'Enseignement correspondante. Analyse le contenu pour identifier les différentes UE et classe chaque question dans l'UE appropriée. Si tu ne peux pas identifier l'UE, utilise "GEN" comme code et "Général" comme nom.`

    return `Tu es un ingénieur pédagogique et concepteur d'examens universitaires de haut niveau.

${isFirstBatch ? `Documents sources:
"""
${docContent}
"""` : `Consignes: Continue la génération des questions pour l'épreuve en cours. Lot ${batchIndex + 1}/${totalBatches}.
Documents sources (pour référence):
"""
${docContent.slice(0, 5000)}
"""`}

Génère les questions suivantes pour une épreuve universitaire:
${questionSpec}

CRITIQUE: Génère EXCLUSIVEMENT les types de questions spécifiés ci-dessus. Ne génère AUCUN autre type de question.

═══ DIFFICULTÉ ═══
Niveau de difficulté GLOBAL de l'épreuve: ${difficulte}
Distribution cible: ${diffDistribution}
${diffInstructions[difficulte] || diffInstructions['MOYEN']}
Chaque question DOIT avoir le champ "difficulte" avec une valeur parmi: FACILE, MOYEN, DIFFICILE, EXPERT.
Il est IMPÉRATIF de respecter cette distribution. Ne mets PAS "MOYEN" à toutes les questions.

Langue: ${langue === 'fr' ? 'Français' : langue === 'en' ? 'English' : langue}

Réponds UNIQUEMENT en JSON valide avec la structure suivante:
{
  "questions": [
    {
      "id": "q${existingQuestions + 1}",
      "type": "QCU|QCM|QRC|REFLEXION",
      "enonce": "Énoncé complet de la question",
      "propositions": [{"id": "a", "text": "Proposition A"}, {"id": "b", "text": "Proposition B"}],
      "reponseCorrecte": "a" ou ["a", "c"] ou "Réponse modèle",
      "explication": "Explication détaillée",
      "difficulte": "FACILE|MOYEN|DIFFICILE|EXPERT",
      "bareme": 2,
      "ueCode": "Code UE (ex: CS101)",
      "ueNom": "Nom UE (ex: Algorithmique)"
    }
  ]${isFirstBatch ? `,
  "titre": "Titre suggéré pour l'épreuve",
  "description": "Description brève",
  "consignes": "Instructions pour les étudiants"` : ''}
}

Règles de formatage par type:
- QCU: propositions = [{id, text}] avec 3 à 5 options, reponseCorrecte = l'id de la bonne réponse (ex: "b")
- QCM: propositions = [{id, text}] avec 3 à 5 options, reponseCorrecte = tableau des ids (ex: ["a", "c"])
- QRC: propositions = null, reponseCorrecte = mots ou phrases clés attendus
- REFLEXION: propositions = null, enonce = mise en situation concrète + consigne de résolution détaillée, reponseCorrecte = guide de correction détaillé avec critères d'évaluation et barème indicatif par partie
- ueCode et ueNom: OBLIGATOIRES pour chaque question — identifient l'Unité d'Enseignement à laquelle la question se rattache

Règles de qualité:
- Chaque question doit tester une compétence DISTINCTE
- Les propositions doivent être plausibles et non triviales
- Les questions doivent couvrir différents thèmes du document
- IMPORTANT: Les bareme doivent être répartis pour que la somme totale atteigne ${config?.noteTotal || 20} points
- Les questions REFLEXION doivent avoir un bareme plus élevé (4-6 pts), QRC moyen (2-4 pts), QCU/QCM plus faible (1-2 pts)
- Assure-toi que chaque question est UNIQUE et ne répète pas les mêmes concepts que les questions précédentes${ueInstructions}${config?.tonPedagogique ? `\n- Ton pédagogique: ${config.tonPedagogique}` : ''}${config?.themes && config.themes.length > 0 ? `\n- Concentre-toi sur ces thèmes: ${config.themes.join(', ')}` : ''}${config?.niveau ? `\n- Niveau cible des étudiants: ${config.niveau}` : ''}`
  }

  const systemPrompt = 'Tu es un ingénieur pédagogique et concepteur d\'examens universitaires de haut niveau. Tu produis des questions bien structurées, exclusivement basées sur les contenus fournis. Tu réponds UNIQUEMENT en JSON valide, sans texte avant ou après le JSON.'

  // Plan the batches
  const batchPlan = planBatches(nbQCU, nbQCM, nbQRC, nbREFLEXION)
  const totalBatches = batchPlan.length
  console.log(`[Epreuve Generate] Planned ${totalBatches} batch(es):`, batchPlan.map(b => b.map(s => `${s.count}×${s.type}`).join('+')).join(', '))

  // Execute each batch with retry logic
  for (let batchIdx = 0; batchIdx < batchPlan.length; batchIdx++) {
    const batch = batchPlan[batchIdx]
    const spec = buildBatchSpec(batch)
    const maxTokens = calculateBatchTokens(batch)
    const expectedCount = batch.reduce((sum, s) => sum + s.count, 0)

    console.log(`[Epreuve Generate] Batch ${batchIdx + 1}/${totalBatches}: ${spec.replace(/\n/g, ', ')} (maxTokens: ${maxTokens})`)

    let batchQuestions: Record<string, unknown>[] = []
    let batchSuccess = false

    for (let attempt = 0; attempt <= MAX_BATCH_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[Epreuve Generate] Retry batch ${batchIdx + 1} (attempt ${attempt + 1})`)
        }

        const batchCompletion = await aiProvider.chatCompletion({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: makeBatchPrompt(spec, allQuestions.length + batchQuestions.length, batchIdx, totalBatches) },
          ],
          temperature: 0.7,
          maxTokens,
        })

        const batchResult = parseAIResponse(batchCompletion.choices?.[0]?.message?.content || '')

        if (batchResult.questions && Array.isArray(batchResult.questions) && batchResult.questions.length > 0) {
          batchQuestions = batchResult.questions as Record<string, unknown>[]
          batchSuccess = true

          // Capture metadata from first batch
          if (batchIdx === 0) {
            if (batchResult.titre) examTitre = String(batchResult.titre)
            if (batchResult.description) examDescription = String(batchResult.description)
            if (batchResult.consignes) examConsignes = String(batchResult.consignes)
          }

          // Log if we got fewer questions than expected
          if (batchQuestions.length < expectedCount) {
            console.warn(`[Epreuve Generate] Batch ${batchIdx + 1} returned ${batchQuestions.length}/${expectedCount} questions`)
          }

          break // Success, exit retry loop
        } else {
          console.warn(`[Epreuve Generate] Batch ${batchIdx + 1} returned no questions (attempt ${attempt + 1})`)
        }
      } catch (batchError) {
        console.error(`[Epreuve Generate] Batch ${batchIdx + 1} error (attempt ${attempt + 1}):`, batchError instanceof Error ? batchError.message : String(batchError))
      }
    }

    if (!batchSuccess) {
      console.warn(`[Epreuve Generate] Batch ${batchIdx + 1} failed after ${MAX_BATCH_RETRIES + 1} attempts, continuing with partial results`)
    }

    allQuestions.push(...batchQuestions)
    console.log(`[Epreuve Generate] Progress: ${allQuestions.length} questions generated so far`)
  }

  // Re-number question IDs and calculate baremeTotal
  let baremeTotal = 0
  allQuestions.forEach((q, idx) => {
    q.id = `q${idx + 1}`
    baremeTotal += typeof q.bareme === 'number' ? q.bareme : 1
  })

  // Return in the same format as a single completion
  const combinedJSON = {
    titre: examTitre || '',
    description: examDescription || '',
    consignes: examConsignes || '',
    questions: allQuestions,
    baremeTotal,
  }

  return {
    choices: [{
      message: { content: JSON.stringify(combinedJSON) }
    }]
  }
}

// ─── JSON Parser ───

/**
 * Parse AI response text to extract JSON, handling markdown code blocks and truncation.
 */
function parseAIResponse(responseText: string): Record<string, unknown> {
  if (!responseText || responseText.length < 10) return {}

  try {
    // Strategy 1: Extract JSON from markdown code blocks
    const codeBlockMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
    if (codeBlockMatch) {
      return JSON.parse(codeBlockMatch[1].trim())
    }

    // Strategy 2: Find the outermost JSON object
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch {
    // If parsing fails, try to repair common JSON issues
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        // Try to fix truncated JSON by closing open brackets
        let json = jsonMatch[0]

        // First, try to find the last complete question object
        // Look for the last closing brace that completes a question
        const lastCompleteQuestion = json.lastIndexOf('},')
        if (lastCompleteQuestion > 0) {
          // Truncate to last complete question, close the questions array and object
          const truncated = json.slice(0, lastCompleteQuestion + 1)
          const openBrackets = (truncated.match(/\[/g) || []).length
          const closeBrackets = (truncated.match(/\]/g) || []).length
          const openBraces = (truncated.match(/\{/g) || []).length
          const closeBraces = (truncated.match(/\}/g) || []).length

          let repaired = truncated
          for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']'
          for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}'

          return JSON.parse(repaired)
        }

        // Fallback: just close open brackets
        const openBrackets = (json.match(/\[/g) || []).length
        const closeBrackets = (json.match(/\]/g) || []).length
        const openBraces = (json.match(/\{/g) || []).length
        const closeBraces = (json.match(/\}/g) || []).length

        for (let i = 0; i < openBrackets - closeBrackets; i++) json += ']'
        for (let i = 0; i < openBraces - closeBraces; i++) json += '}'

        return JSON.parse(json)
      }
    } catch {
      // Give up
    }
  }

  return {}
}

// ─── Main Handler ───

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Auth check
  const authResult = await requireRole(request, ['ENSEIGNANT'])
  if (isAuthError(authResult)) return authResult

  try {
    const body: GenerateExamRequest = await request.json()
    const { documentIds, enseignantId, config, preview } = body

    // Validate required fields
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return NextResponse.json(
        { error: 'Au moins un document est requis pour générer une épreuve' },
        { status: 400 }
      )
    }

    if (!enseignantId) {
      return NextResponse.json(
        { error: 'Identifiant enseignant requis' },
        { status: 400 }
      )
    }

    // Verify the authenticated user matches the enseignantId
    if (authResult.id !== enseignantId) {
      return NextResponse.json(
        { error: 'Vous n\'êtes pas autorisé à générer une épreuve pour cet enseignant' },
        { status: 403 }
      )
    }

    console.log('[Epreuve Generate] Request received:', {
      enseignantId,
      documentIds,
      config,
      preview: !!preview,
    })

    // Fetch all documents from DB
    const documents = await db.document.findMany({
      where: {
        id: { in: documentIds },
        ownerId: enseignantId,
        deletedAt: null,
      },
    })

    if (documents.length === 0) {
      return NextResponse.json(
        { error: 'Aucun document trouvé ou vous n\'avez pas accès à ces documents' },
        { status: 404 }
      )
    }

    // Verify all documents have ANALYSE status
    const nonAnalyzed = documents.filter((d) => d.statutAnalyse !== 'ANALYSE')
    if (nonAnalyzed.length > 0) {
      return NextResponse.json(
        {
          error: `${nonAnalyzed.length} document(s) n'ont pas encore été analysés. Veuillez attendre la fin de l'analyse.`,
          documentIds: nonAnalyzed.map((d) => d.id),
        },
        { status: 400 }
      )
    }

    // Verify all requested documents were found
    const foundIds = new Set(documents.map((d) => d.id))
    const missingIds = documentIds.filter((id) => !foundIds.has(id))
    if (missingIds.length > 0) {
      return NextResponse.json(
        {
          error: `${missingIds.length} document(s) introuvable(s) ou non autorisé(s)`,
          missingIds,
        },
        { status: 403 }
      )
    }

    // Determine question counts
    // IMPORTANT: Use ?? (nullish coalescing) instead of || so that 0 is respected
    // (with ||, setting qcu=0 would fallback to default 3, which is the bug)
    const typesQuestions = config.typesQuestions || {}
    const nbQCU = typesQuestions.qcu ?? 0
    const nbQCM = typesQuestions.qcm ?? 0
    const nbQRC = typesQuestions.qrc ?? 0
    const nbREFLEXION = typesQuestions.reflexion ?? 0
    const totalQuestions = nbQCU + nbQCM + nbQRC + nbREFLEXION

    // If no types specified at all, provide sensible defaults
    const hasAnyTypeSpecified = (typesQuestions.qcu !== undefined) || (typesQuestions.qcm !== undefined) || (typesQuestions.qrc !== undefined) || (typesQuestions.reflexion !== undefined)
    const finalQCU = hasAnyTypeSpecified ? nbQCU : 3
    const finalQCM = hasAnyTypeSpecified ? nbQCM : 2
    const finalQRC = hasAnyTypeSpecified ? nbQRC : 2
    const finalREFLEXION = hasAnyTypeSpecified ? nbREFLEXION : 1
    const finalTotal = finalQCU + finalQCM + finalQRC + finalREFLEXION

    if (finalTotal === 0) {
      return NextResponse.json(
        { error: 'Veuillez spécifier au moins un type de question à générer' },
        { status: 400 }
      )
    }

    // Validate max question count
    if (finalTotal > 100) {
      return NextResponse.json(
        { error: `Le nombre maximum de questions est de 100. Vous en avez demandé ${finalTotal}.` },
        { status: 400 }
      )
    }

    // Concatenate all contenuTexte with dynamic truncation based on question count
    const docs = documents.filter((d) => d.contenuTexte && d.contenuTexte.length > 0)
    if (docs.length === 0) {
      return NextResponse.json(
        { error: 'Aucun document ne contient de texte extractible pour la génération' },
        { status: 400 }
      )
    }

    // Dynamic content limit: more questions need more source material
    const dynamicMaxContent = Math.min(
      MAX_CONTENT_CHARS_HARD,
      Math.max(MIN_CONTENT_CHARS, finalTotal * CONTENT_CHARS_PER_QUESTION)
    )
    console.log(`[Epreuve Generate] Dynamic content limit: ${dynamicMaxContent} chars for ${finalTotal} questions`)

    const totalLength = docs.reduce((sum, d) => sum + (d.contenuTexte?.length || 0), 0)

    let concatenatedText: string
    if (totalLength <= dynamicMaxContent) {
      // No truncation needed
      concatenatedText = docs.map((d) => d.contenuTexte || '').join('\n\n---\n\n')
    } else {
      // Truncate proportionally
      concatenatedText = docs
        .map((d) => {
          const docLength = d.contenuTexte?.length || 0
          const proportion = docLength / totalLength
          const allowedChars = Math.max(500, Math.floor(dynamicMaxContent * proportion))
          const text = d.contenuTexte || ''
          return text.slice(0, allowedChars)
        })
        .join('\n\n---\n\n')
    }

    const difficulte = config.difficulte || 'MOYEN'
    const duree = config.duree || 60
    const titre = config.titre || `Épreuve générée par IA - ${new Date().toLocaleDateString('fr-FR')}`
    const langue = config.langue || 'fr'
    const targetNoteTotal = config.noteTotal || 20
    const diffDistribution = getDifficulteDistribution(difficulte)

    // Fetch UE info if uniteEnseignementId is provided
    let ueInfo = ''
    if (config.uniteEnseignementId) {
      try {
        const ue = await db.uniteEnseignement.findUnique({
          where: { id: config.uniteEnseignementId },
          select: { id: true, code: true, nom: true, description: true },
        })
        if (ue) {
          ueInfo = `\nUnité d'Enseignement cible: ${ue.code} - ${ue.nom}${ue.description ? ` (${ue.description})` : ''}`
        }
      } catch {
        // Ignore UE fetch errors
      }
    }

    // Build difficulty enforcement instructions for single-shot prompt
    const diffInstructionsSingle: Record<string, string> = {
      FACILE: `CRITIQUE: Le niveau demandé est FACILE. Au moins 60% des questions doivent avoir difficulte="FACILE". Le reste doit être MOYEN (25%) ou DIFFICILE (15%). Ne génère PAS de questions EXPERT.`,
      MOYEN: `CRITIQUE: Le niveau demandé est MOYEN. Au moins 50% des questions doivent avoir difficulte="MOYEN". Répartis le reste: ~15% FACILE, ~25% DIFFICILE, ~10% EXPERT. Ne génère PAS principalement des questions FACILE.`,
      DIFFICILE: `CRITIQUE: Le niveau demandé est DIFFICILE. Au moins 50% des questions doivent avoir difficulte="DIFFICILE". Répartis le reste: ~5% FACILE, ~15% MOYEN, ~30% EXPERT. Ne génère PAS principalement des questions FACILE ou MOYEN.`,
      EXPERT: `CRITIQUE: Le niveau demandé est EXPERT. Au moins 60% des questions doivent avoir difficulte="EXPERT". Répartis le reste: ~5% FACILE, ~10% MOYEN, ~25% DIFFICILE. Ne génère PAS principalement des questions FACILE ou MOYEN.`,
    }

    const ueInstructionsSingle = config.uniteEnseignementId
      ? `\n- OBLIGATOIRE: Chaque question DOIT avoir ueCode et ueNom correspondant à l'UE cible (${ueInfo || 'voir documents'}). Si le contenu couvre plusieurs UE, classe chaque question dans l'UE la plus pertinente.`
      : `\n- OBLIGATOIRE: Chaque question DOIT avoir ueCode et ueNom identifiant l'Unité d'Enseignement correspondante. Analyse le contenu pour identifier les différentes UE et classe chaque question dans l'UE appropriée. Si tu ne peux pas identifier l'UE, utilise "GEN" comme code et "Général" comme nom.`

    // Build AI prompt — pédagogical specification for university exam generation
    const prompt = `Tu es un ingénieur pédagogique et un concepteur d'examens universitaires de haut niveau.
Ton rôle est d'analyser les documents de cours fournis et de générer une épreuve complète et équilibrée.

Documents sources:
"""
${concatenatedText}
"""
${ueInfo}
Consignes strictes pour la génération :
1. Base-toi exclusivement sur les concepts présents dans le texte pour éviter le hors-sujet.
2. Types de questions autorisés pour cette épreuve :
${finalQCU > 0 ? '   - "QCU" : Question à Choix Unique (Une seule bonne réponse parmi les options).' : '   - "QCU" : INTERDIT — Ne génère PAS de questions QCU pour cette épreuve.'}
${finalQCM > 0 ? '   - "QCM" : Question à Choix Multiples (Plusieurs bonnes réponses possibles dans le tableau \'reponses_correctes\').' : '   - "QCM" : INTERDIT — Ne génère PAS de questions QCM pour cette épreuve.'}
${finalQRC > 0 ? '   - "QRC" : Question à Réponse Courte (Pas d\'options, l\'étudiant doit formuler une réponse brève. Fournis les mots ou phrases clés attendus).' : '   - "QRC" : INTERDIT — Ne génère PAS de questions QRC pour cette épreuve.'}
${finalREFLEXION > 0 ? '   - "REFLEXION" : Mini sujet de réflexion ou résolution de problème (Mise en situation concrète où l\'étudiant doit analyser et rédiger une solution. Fournis un guide de correction détaillé pour l\'enseignant).' : '   - "REFLEXION" : INTERDIT — Ne génère PAS de questions REFLEXION pour cette épreuve.'}

Génère une épreuve structurée contenant exactement:
${finalQCU > 0 ? `- ${finalQCU} question(s) QCU (Choix Unique)` : ''}
${finalQCM > 0 ? `- ${finalQCM} question(s) QCM (Choix Multiples)` : ''}
${finalQRC > 0 ? `- ${finalQRC} question(s) QRC (Réponse Courte)` : ''}
${finalREFLEXION > 0 ? `- ${finalREFLEXION} question(s) REFLEXION (Mini sujet de réflexion)` : ''}

CRITIQUE: Tu dois UNIQUEMENT générer les types de questions demandés ci-dessus. Ne génère AUCUN autre type de question. Si seul le type QCM est demandé, génère EXCLUSIVEMENT des questions QCM.

═══ DIFFICULTÉ ═══
Niveau de difficulté GLOBAL de l'épreuve: ${difficulte}
Distribution cible: ${diffDistribution}
${diffInstructionsSingle[difficulte] || diffInstructionsSingle['MOYEN']}
Chaque question DOIT avoir le champ "difficulte" avec une valeur parmi: FACILE, MOYEN, DIFFICILE, EXPERT.
Il est IMPÉRATIF de respecter cette distribution. Ne mets PAS "MOYEN" à toutes les questions.

Langue: ${langue === 'fr' ? 'Français' : langue === 'en' ? 'English' : langue}

Réponds UNIQUEMENT en JSON valide avec la structure suivante:
{
  "titre": "Titre suggéré pour l'épreuve",
  "description": "Description brève de l'épreuve",
  "consignes": "Instructions générales pour les étudiants",
  "questions": [
    {
      "id": "q1",
      "type": "QCU|QCM|QRC|REFLEXION",
      "enonce": "Énoncé complet de la question",
      "propositions": [{"id": "a", "text": "Proposition A"}, {"id": "b", "text": "Proposition B"}, {"id": "c", "text": "Proposition C"}, {"id": "d", "text": "Proposition D"}],
      "reponseCorrecte": "a" ou ["a", "c"] ou "Réponse modèle attendue",
      "explication": "Explication détaillée de la réponse correcte",
      "difficulte": "FACILE|MOYEN|DIFFICILE|EXPERT",
      "bareme": 2,
      "ueCode": "Code de l'UE (ex: CS101)",
      "ueNom": "Nom de l'UE (ex: Algorithmique)"
    }
  ],
  "baremeTotal": ${targetNoteTotal}
}

Règles de formatage par type:
- QCU: propositions = [{id, text}] avec 3 à 5 options, reponseCorrecte = l'id de la seule bonne réponse (ex: "b")
- QCM: propositions = [{id, text}] avec 3 à 5 options, reponseCorrecte = tableau des ids des bonnes réponses (ex: ["a", "c"])
- QRC: propositions = null, reponseCorrecte = les mots ou phrases clés attendus en texte
- REFLEXION: propositions = null, enonce = mise en situation concrète + consigne de résolution détaillée, reponseCorrecte = guide de correction détaillé pour l'enseignant (critères d'évaluation, éléments de réponse attendus, barème indicatif par partie)
- ueCode et ueNom: OBLIGATOIRES pour chaque question — identifient l'Unité d'Enseignement à laquelle la question se rattache. Si le contenu couvre plusieurs UE, classe chaque question dans l'UE correspondante.

Règles de qualité:
- Chaque question doit tester une compétence ou connaissance DISTINCTE du document
- Les propositions des QCU/QCM doivent être plausibles, non triviales et sans indice linguistique
- Les QRC doivent demander une réponse en 1 à 5 lignes maximum
- Les REFLEXION doivent présenter une situation authentique et professionnelle
- L'épreuve doit couvrir les principaux thèmes des documents de manière équilibrée
- Le barème (bareme) est un nombre entier ou demi-point par question
- IMPORTANT: La somme de tous les bareme individuels doit être EXACTEMENT égale à ${targetNoteTotal} (baremeTotal = ${targetNoteTotal})
- Les questions REFLEXION doivent avoir un bareme plus élevé (4-6 pts), les QRC un bareme moyen (2-4 pts), les QCU/QCM un bareme plus faible (1-2 pts)
- Les questions doivent progresser en difficulté (QCU faciles → REFLEXION expertes)
- baremeTotal = somme de tous les bareme individuels = ${targetNoteTotal}${ueInstructionsSingle}${config.tonPedagogique ? `\n- Ton pédagogique: ${config.tonPedagogique}` : ''}${config.themes && config.themes.length > 0 ? `\n- Concentre-toi sur ces thèmes: ${config.themes.join(', ')}` : ''}${config.themesExclus && config.themesExclus.length > 0 ? `\n- Évite ces thèmes: ${config.themesExclus.join(', ')}` : ''}${config.niveau ? `\n- Niveau cible des étudiants: ${config.niveau}` : ''}`

    // Call AI provider
    console.log('[Epreuve Generate] Getting AI provider...')
    let aiProvider
    try {
      aiProvider = await getAIProvider()
      console.log('[Epreuve Generate] AI provider obtained:', aiProvider.name, `(${aiProvider.providerType})`)
    } catch (providerError) {
      console.error('[Epreuve Generate] Failed to get AI provider:', providerError)
      return NextResponse.json(
        { error: 'Erreur de connexion au service IA. Vérifiez la configuration du fournisseur IA.' },
        { status: 500 }
      )
    }

    let completion
    try {
      console.log('[Epreuve Generate] Calling AI API...')

      // For small exams (≤12 questions), try single-shot generation first
      // For larger exams, always use batch generation
      const shouldBatch = finalTotal > 12

      if (shouldBatch) {
        console.log(`[Epreuve Generate] Large exam detected (${finalTotal} questions), using smart batch generation...`)
        completion = await generateInBatches(aiProvider, prompt, finalQCU, finalQCM, finalQRC, finalREFLEXION, difficulte, langue, config)
      } else {
        // Single-shot for small exams
        const estimatedTokens = finalQCU * 300 + finalQCM * 400 + finalQRC * 500 + finalREFLEXION * 1000 + 500
        const maxTokens = Math.min(MAX_BATCH_TOKENS, Math.max(MIN_BATCH_TOKENS, estimatedTokens))
        console.log('[Epreuve Generate] Single-shot mode, using maxTokens:', maxTokens, '(estimated:', estimatedTokens, ')')

        completion = await aiProvider.chatCompletion({
          messages: [
            {
              role: 'system',
              content: 'Tu es un ingénieur pédagogique et concepteur d\'examens universitaires de haut niveau. Tu produis des épreuves complètes, équilibrées et bien structurées, exclusivement basées sur les contenus fournis. Tu réponds UNIQUEMENT en JSON valide, sans texte avant ou après le JSON.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.7,
          maxTokens,
        })
      }
      console.log('[Epreuve Generate] AI API responded in', Date.now() - startTime, 'ms')
    } catch (aiError) {
      const aiErrorMsg = aiError instanceof Error ? aiError.message : String(aiError)
      console.error('[Epreuve Generate] AI API call failed:', aiErrorMsg)

      if (
        aiErrorMsg.includes('身份验证失败') ||
        aiErrorMsg.includes('Authentication') ||
        aiErrorMsg.includes('auth')
      ) {
        return NextResponse.json(
          { error: 'Erreur d\'authentification du service IA. Veuillez contacter l\'administrateur.' },
          { status: 500 }
        )
      }
      if (
        aiErrorMsg.includes('ECONNREFUSED') ||
        aiErrorMsg.includes('ENOTFOUND') ||
        aiErrorMsg.includes('fetch failed')
      ) {
        return NextResponse.json(
          { error: 'Le service IA est actuellement indisponible. Veuillez réessayer dans quelques minutes.' },
          { status: 503 }
        )
      }
      if (aiErrorMsg.includes('timeout') || aiErrorMsg.includes('ETIMEDOUT')) {
        return NextResponse.json(
          { error: 'La requête au service IA a expiré. Le serveur met trop de temps à répondre. Réessayez ou contactez l\'administrateur.' },
          { status: 504 }
        )
      }

      return NextResponse.json(
        { error: `Erreur du service IA: ${aiErrorMsg}` },
        { status: 500 }
      )
    }

    // Validate AI response structure
    if (
      !completion ||
      !completion.choices ||
      !Array.isArray(completion.choices) ||
      completion.choices.length === 0
    ) {
      console.error('[Epreuve Generate] Invalid completion response:', JSON.stringify(completion).slice(0, 500))
      return NextResponse.json(
        { error: 'Le service IA a retourné une réponse invalide. Veuillez réessayer.' },
        { status: 500 }
      )
    }

    const responseText = completion.choices[0]?.message?.content || ''
    console.log('[Epreuve Generate] AI response length:', responseText.length)

    if (!responseText || responseText.length < 10) {
      return NextResponse.json(
        { error: 'Le service IA n\'a pas retourné de réponse. Veuillez réessayer.' },
        { status: 500 }
      )
    }

    // Parse JSON response (handle markdown code blocks + truncated JSON)
    let generatedExam
    try {
      generatedExam = parseAIResponse(responseText)
      if (!generatedExam || Object.keys(generatedExam).length === 0) {
        throw new Error('No JSON found in response')
      }
      console.log('[Epreuve Generate] Parsed successfully')
    } catch (parseError) {
      console.error('[Epreuve Generate] Failed to parse AI response:', parseError)
      console.error('[Epreuve Generate] Raw response (first 1000 chars):', responseText.slice(0, 1000))
      return NextResponse.json(
        { error: 'Erreur lors du parsing de la réponse IA. L\'IA n\'a pas retourné un format valide. Veuillez réessayer.' },
        { status: 500 }
      )
    }

    // Validate structure
    if (!generatedExam.questions || !Array.isArray(generatedExam.questions)) {
      console.error('[Epreuve Generate] Invalid structure:', JSON.stringify(generatedExam).slice(0, 500))
      return NextResponse.json(
        { error: 'La structure de la réponse IA est invalide. Veuillez réessayer.' },
        { status: 500 }
      )
    }

    if (generatedExam.questions.length === 0) {
      return NextResponse.json(
        { error: 'L\'IA n\'a généré aucune question. Veuillez réessayer.' },
        { status: 500 }
      )
    }

    // Prepare sanitized question data in the new contenu format
    const validTypes = ['QCU', 'QCM', 'QRC', 'REFLEXION']
    const validDifficultes = ['FACILE', 'MOYEN', 'DIFFICILE', 'EXPERT']

    // Build the set of allowed question types based on teacher's configuration
    const allowedTypes = new Set<string>()
    if (finalQCU > 0) allowedTypes.add('QCU')
    if (finalQCM > 0) allowedTypes.add('QCM')
    if (finalQRC > 0) allowedTypes.add('QRC')
    if (finalREFLEXION > 0) allowedTypes.add('REFLEXION')

    const sanitizedQuestions = generatedExam.questions
      .map((q: Record<string, unknown>, idx: number) => {
        const rawType = q.type as string
        // Filter out questions of types the teacher did NOT request
        const qType = allowedTypes.has(rawType) ? rawType : null
        if (!qType) {
          console.warn(`[Epreuve Generate] Filtering out question of unauthorized type "${rawType}" (teacher only requested: ${Array.from(allowedTypes).join(', ')})`)
          return null
        }
        const qDifficulte = validDifficultes.includes(q.difficulte as string) ? q.difficulte : difficulte
        const qEnonce = String(q.enonce || '').trim()
        if (!qEnonce) return null

        const qUeCode = q.ueCode ? String(q.ueCode) : null
        const qUeNom = q.ueNom ? String(q.ueNom) : null

        return {
          id: q.id || `q${idx + 1}`,
          type: qType,
          enonce: qEnonce,
          propositions: q.propositions || null,
          reponseCorrecte: q.reponseCorrecte || null,
          explication: q.explication ? String(q.explication) : null,
          difficulte: qDifficulte,
          bareme: typeof q.bareme === 'number' ? q.bareme : 1,
          ueCode: qUeCode,
          ueNom: qUeNom,
        }
      })
      .filter(Boolean)

    if (sanitizedQuestions.length === 0) {
      return NextResponse.json(
        { error: 'Aucune question valide n\'a été générée. Veuillez réessayer.' },
        { status: 500 }
      )
    }

    // Scale bareme to match targetNoteTotal if the sum doesn't match
    const currentTotal = sanitizedQuestions.reduce((sum: number, q) => sum + (q.bareme as number), 0)
    if (currentTotal > 0 && Math.abs(currentTotal - targetNoteTotal) > 0.5) {
      const scaleFactor = targetNoteTotal / currentTotal
      sanitizedQuestions.forEach((q) => {
        // Round to nearest 0.5 for cleaner values
        q.bareme = Math.round((q.bareme as number) * scaleFactor * 2) / 2
      })
      // Adjust last question to fix rounding errors
      const newTotal = sanitizedQuestions.reduce((sum: number, q) => sum + (q.bareme as number), 0)
      const diff = targetNoteTotal - newTotal
      if (Math.abs(diff) > 0 && sanitizedQuestions.length > 0) {
        const lastQ = sanitizedQuestions[sanitizedQuestions.length - 1]
        lastQ.bareme = Math.round(((lastQ.bareme as number) + diff) * 2) / 2
      }
    }

    // Build contenu object (new format)
    const finalBaremeTotal = sanitizedQuestions.reduce((sum: number, q) => sum + (q.bareme as number), 0)
    const contenu = {
      questions: sanitizedQuestions,
      consignes: generatedExam.consignes || config.consignes || '',
      baremeTotal: finalBaremeTotal,
    }

    // Use the AI-suggested title/description if provided
    const examTitre = generatedExam.titre || titre
    const examDescription = generatedExam.description || `Épreuve générée par IA à partir de ${documents.length} document(s)`

    // Auto-detect UE from generated questions if not already set
    let autoDetectedUEId: string | null = config.uniteEnseignementId || null
    if (!autoDetectedUEId) {
      try {
        // Count UE codes from generated questions to find the majority
        const ueCodeCounts = new Map<string, { code: string; nom: string; count: number }>()
        for (const q of sanitizedQuestions) {
          const ueCode = (q.ueCode as string) || null
          if (ueCode) {
            const existing = ueCodeCounts.get(ueCode)
            if (existing) {
              existing.count++
            } else {
              ueCodeCounts.set(ueCode, { code: ueCode, nom: (q.ueNom as string) || ueCode, count: 1 })
            }
          }
        }

        // Find the most common UE code
        if (ueCodeCounts.size > 0) {
          const sortedUEs = Array.from(ueCodeCounts.values()).sort((a, b) => b.count - a.count)
          const majorityUE = sortedUEs[0]

          // Try to match with a UE in the database
          if (majorityUE && config.filiereId) {
            const matchingUE = await db.uniteEnseignement.findFirst({
              where: {
                code: majorityUE.code,
                filiereId: config.filiereId,
              },
              select: { id: true, code: true, nom: true },
            })
            if (matchingUE) {
              autoDetectedUEId = matchingUE.id
              console.log(`[Epreuve Generate] Auto-detected UE: ${matchingUE.code} - ${matchingUE.nom} (${majorityUE.count}/${sanitizedQuestions.length} questions)`)
            }
          }
        }
      } catch (ueError) {
        console.warn('[Epreuve Generate] Failed to auto-detect UE:', ueError)
      }
    }

    // PREVIEW MODE: return content without saving to DB
    if (preview) {
      return NextResponse.json({
        contenu,
        titre: examTitre,
        description: examDescription,
        duree,
        documentIds,
        totalQuestions: sanitizedQuestions.length,
        baremeTotal: contenu.baremeTotal,
        autoDetectedUEId: autoDetectedUEId || undefined,
        message: 'Aperçu généré avec succès',
      })
    }

    // SAVE MODE: Create Epreuve with contenu JSONB format
    const now = new Date()
    const dateFin = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const result = await db.epreuve.create({
      data: {
        enseignantId,
        titre: examTitre,
        description: examDescription,
        duree,
        dateDebut: now,
        dateFin,
        melangeQuestions: true,
        melangePropositions: true,
        blocageRetour: false,
        statut: 'BROUILLON',
        generationMode: 'IA_ASSISTEE',
        contenu,
        noteTotal: targetNoteTotal,
        filiereId: config.filiereId || null,
        uniteEnseignementId: autoDetectedUEId,
        groupesCibles: config.niveau ? JSON.stringify({ groupes: [], niveau: config.niveau }) : null,
        sourceDocuments: {
          create: documents.map((doc) => ({
            documentId: doc.id,
          })),
        },
      },
      include: {
        sourceDocuments: {
          include: {
            document: {
              select: {
                id: true,
                nomFichier: true,
                typeMime: true,
                statutAnalyse: true,
                themesDetectes: true,
                resumeAnalyse: true,
              },
            },
          },
        },
        enseignant: {
          select: { id: true, name: true, email: true },
        },
        filiere: {
          select: { id: true, nom: true, code: true },
        },
        uniteEnseignement: {
          select: { id: true, nom: true, code: true },
        },
      },
    })

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          userId: enseignantId,
          userEmail: authResult.email,
          action: 'GENERATE_EPREUVE_IA',
          entite: 'Epreuve',
          entiteId: result.id,
          details: `Épreuve « ${examTitre} » générée par IA avec ${sanitizedQuestions.length} questions depuis ${documents.length} document(s)`,
        },
      })
    } catch (auditError) {
      console.warn('[Epreuve Generate] Failed to create audit log:', auditError)
    }

    console.log(
      '[Epreuve Generate] Success! Generated epreuve with',
      sanitizedQuestions.length,
      'questions in',
      Date.now() - startTime,
      'ms'
    )

    // Parse JSON string fields for the response
    const parsedResult = {
      ...result,
      groupesCibles: result.groupesCibles ? JSON.parse(result.groupesCibles as string) : null,
    }

    return NextResponse.json({
      epreuve: parsedResult,
      contenu,
      totalQuestions: sanitizedQuestions.length,
      message: `Épreuve générée avec succès avec ${sanitizedQuestions.length} question(s)`,
    })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error('[Epreuve Generate] Unhandled error after', elapsed, 'ms:', error)

    const errorMsg = error instanceof Error ? error.message : String(error)

    if (errorMsg.includes('Prisma') || errorMsg.includes('database')) {
      return NextResponse.json(
        { error: 'Erreur de base de données. Veuillez réessayer.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: `Erreur lors de la génération de l'épreuve: ${errorMsg}` },
      { status: 500 }
    )
  }
}
