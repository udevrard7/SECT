import ZAI from 'z-ai-web-dev-sdk';

export interface DocumentAnalysis {
  sujetPrincipal: string;
  themesCles: string[];
  conceptsCles: string[];
  resume: string;
  niveau: string;
  volumeEstime: string;
  suggestions: string[];
}

export interface GeneratedQuestion {
  enonce: string;
  type: 'QCU' | 'QCM' | 'QRC' | 'TRS';
  difficulte: 'FACILE' | 'MOYEN' | 'DIFFICILE' | 'EXPERT';
  propositions?: { text: string; isCorrect: boolean }[];
  reponseCorrecte?: string;
  explication: string;
  themes?: string[];
}

// Singleton ZAI instance
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getAIClient() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

/**
 * Helper to extract JSON from AI response text.
 * Handles cases where AI wraps response in markdown code blocks.
 */
function extractJson(text: string): string | null {
  // Try to find JSON in markdown code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  // Try to find raw JSON object or array
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  return null;
}

export async function analyzeDocument(
  content: string,
  filename: string
): Promise<DocumentAnalysis> {
  // Truncate content if too long
  const truncatedContent = content.length > 12000
    ? content.substring(0, 12000) + '\n... [contenu tronqué]'
    : content;

  const prompt = `Tu es un assistant pédagogique expert. Analyse le document suivant et fournis une analyse structurée.

Nom du document: ${filename}
Contenu:
${truncatedContent}

Réponds UNIQUEMENT en JSON valide sans aucun texte avant ou après. Utilise cette structure exacte:
{
  "sujetPrincipal": "Le sujet principal du document",
  "themesCles": ["thème 1", "thème 2", "thème 3"],
  "conceptsCles": ["concept 1", "concept 2", "concept 3"],
  "resume": "Un résumé concis du document (3-5 phrases)",
  "niveau": "Licence/Master/Doctorat ou autre niveau estimé",
  "volumeEstime": "Estimation du volume (ex: 50 pages, 12000 mots)",
  "suggestions": ["suggestion 1", "suggestion 2"]
}`;

  try {
    const client = await getAIClient();
    const response = await client.chat.completions.create({
      messages: [
        { role: 'assistant', content: 'Tu es un analyste de documents académiques. Tu réponds UNIQUEMENT en JSON valide, sans texte additionnel.' },
        { role: 'user', content: prompt }
      ],
      thinking: { type: 'disabled' }
    });

    const text = response.choices?.[0]?.message?.content || '';

    const jsonStr = extractJson(text);
    if (!jsonStr) {
      return {
        sujetPrincipal: filename,
        themesCles: [],
        conceptsCles: [],
        resume: text.substring(0, 500) || 'Analyse non disponible',
        niveau: 'Non déterminé',
        volumeEstime: 'Non estimé',
        suggestions: [],
      };
    }

    const parsed = JSON.parse(jsonStr);
    return {
      sujetPrincipal: parsed.sujetPrincipal || filename,
      themesCles: Array.isArray(parsed.themesCles) ? parsed.themesCles : [],
      conceptsCles: Array.isArray(parsed.conceptsCles) ? parsed.conceptsCles : [],
      resume: parsed.resume || '',
      niveau: parsed.niveau || 'Non déterminé',
      volumeEstime: parsed.volumeEstime || 'Non estimé',
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    };
  } catch (error: any) {
    console.error('AI analysis error:', error);
    return {
      sujetPrincipal: filename,
      themesCles: [],
      conceptsCles: [],
      resume: 'Analyse automatique non disponible. Le document a été importé avec succès.',
      niveau: 'Non déterminé',
      volumeEstime: 'Non estimé',
      suggestions: ['Relancer l\'analyse ultérieurement'],
    };
  }
}

export async function generateQuestions(
  content: string,
  filename: string,
  type: string = 'MIXTE',
  difficulte: string = 'MIXTE',
  count: number = 5
): Promise<GeneratedQuestion[]> {
  const truncatedContent = content.length > 12000
    ? content.substring(0, 12000) + '\n... [contenu tronqué]'
    : content;

  const typeInstruction = type === 'MIXTE'
    ? 'un mélange de questions QCU (choix unique), QCM (choix multiples) et QRC (réponse courte)'
    : type === 'QCU'
    ? 'uniquement des questions QCU (choix unique avec 4 options dont 1 seule bonne)'
    : type === 'QCM'
    ? 'uniquement des questions QCM (choix multiples avec 4 options dont au moins 1 bonne réponse)'
    : 'uniquement des questions QRC (réponses courtes ouvertes)';

  const diffInstruction = difficulte === 'MIXTE'
    ? 'de difficultés variées (facile, moyen, difficile)'
    : difficulte === 'FACILE'
    ? 'de difficulté facile'
    : difficulte === 'MOYEN'
    ? 'de difficulté moyenne'
    : difficulte === 'DIFFICILE'
    ? 'de difficulté difficile'
    : 'de difficulté experte';

  const prompt = `Génère ${count} questions d'évaluation à partir du document suivant.

Nom du document: ${filename}
Contenu:
${truncatedContent}

Consignes:
- Génère ${typeInstruction}
- Les questions doivent être ${diffInstruction}
- Pour les QCU: fournis exactement 4 choix dont 1 seule bonne réponse
- Pour les QCM: fournis exactement 4 choix dont au moins 1 bonne réponse
- Pour les QRC: pas de propositions, juste la réponse attendue
- Chaque question doit avoir une explication détaillée
- Ajoute les thèmes associés à chaque question

Réponds UNIQUEMENT en JSON valide avec cette structure (pas de markdown, pas de commentaires):
{
  "questions": [
    {
      "enonce": "Texte de la question",
      "type": "QCU",
      "difficulte": "FACILE",
      "propositions": [{"text": "Option A", "isCorrect": false}, {"text": "Option B", "isCorrect": true}, {"text": "Option C", "isCorrect": false}, {"text": "Option D", "isCorrect": false}],
      "reponseCorrecte": "Option B",
      "explication": "Explication de la réponse",
      "themes": ["thème1", "thème2"]
    }
  ]
}

Pour les QRC: propositions doit être null et reponseCorrecte doit contenir la réponse attendue.
Types valides: QCU, QCM, QRC.
Difficultés valides: FACILE, MOYEN, DIFFICILE, EXPERT.`;

  try {
    const client = await getAIClient();
    const response = await client.chat.completions.create({
      messages: [
        { role: 'assistant', content: 'Tu es un enseignant expert en création de questions d\'examen. Tu réponds UNIQUEMENT en JSON valide, sans texte additionnel.' },
        { role: 'user', content: prompt }
      ],
      thinking: { type: 'disabled' }
    });

    const text = response.choices?.[0]?.message?.content || '';
    const jsonStr = extractJson(text);

    if (!jsonStr) {
      return [];
    }

    const parsed = JSON.parse(jsonStr);
    const questions = parsed.questions || [];

    return questions.map((q: any) => ({
      enonce: String(q.enonce || ''),
      type: ['QCU', 'QCM', 'QRC', 'TRS', 'CODE'].includes(q.type) ? q.type : 'QRC',
      difficulte: ['FACILE', 'MOYEN', 'DIFFICILE', 'EXPERT'].includes(q.difficulte) ? q.difficulte : 'MOYEN',
      propositions: (q.type === 'QCU' || q.type === 'QCM') && Array.isArray(q.propositions)
        ? q.propositions.map((c: any) => ({ text: String(c.text || ''), isCorrect: Boolean(c.isCorrect) }))
        : undefined,
      reponseCorrecte: q.type === 'QRC' ? String(q.reponseCorrecte || '') : undefined,
      explication: String(q.explication || ''),
      themes: Array.isArray(q.themes) ? q.themes : undefined,
    })).filter((q: GeneratedQuestion) => q.enonce.length > 0);
  } catch (error: any) {
    console.error('AI question generation error:', error);
    return [];
  }
}
