/**
 * Shared types and constants for the CODE (Pratique / Coding) question type.
 *
 * This module defines the data structures used across:
 * - AI generation (creating coding questions)
 * - Student interface (Monaco editor + code execution)
 * - Correction interface (test results display + manual override)
 * - PDF export
 * - Grading
 */

// ─── Supported Languages ───

export type CodingLanguage = 'python' | 'javascript' | 'typescript' | 'c' | 'java'

export const CODING_LANGUAGES: Array<{
  value: CodingLanguage
  label: string
  monacoLang: string
  executionType: 'browser' | 'server'
  fileExtension: string
  icon: string
}> = [
  { value: 'python', label: 'Python', monacoLang: 'python', executionType: 'browser', fileExtension: '.py', icon: '🐍' },
  { value: 'javascript', label: 'JavaScript', monacoLang: 'javascript', executionType: 'browser', fileExtension: '.js', icon: '📜' },
  { value: 'typescript', label: 'TypeScript', monacoLang: 'typescript', executionType: 'browser', fileExtension: '.ts', icon: '🔷' },
  { value: 'c', label: 'C', monacoLang: 'c', executionType: 'server', fileExtension: '.c', icon: '⚙️' },
  { value: 'java', label: 'Java', monacoLang: 'java', executionType: 'server', fileExtension: '.java', icon: '☕' },
]

export function getCodingLanguageConfig(lang: CodingLanguage) {
  return CODING_LANGUAGES.find(l => l.value === lang) || CODING_LANGUAGES[0]
}

// ─── Test Case ───

export interface TestCase {
  nom: string
  entree: string       // Input data (JSON string or plain text)
  sortieAttendue: string  // Expected output (string)
  description?: string
}

// ─── Test Result (after execution) ───

export interface TestResult {
  nom: string
  passed: boolean
  output: string
  expected: string
  error?: string
  duration?: number  // ms
}

// ─── Code Execution Result ───

export interface CodeExecutionResult {
  success: boolean
  output: string
  error?: string
  testResults?: TestResult[]
  totalTests?: number
  passedTests?: number
  executionTime?: number  // ms
  memoryUsed?: number     // KB
}

// ─── Coding Question Content (stored in contenu JSONB) ───

export interface CodingQuestionContent {
  id: string
  type: 'CODE'
  enonce: string
  langage: CodingLanguage
  codeInitial: string       // Starter code template shown to student
  fonctionSignature: string // e.g., "def calculer_moyenne(nombres):"
  testsPublics: TestCase[]  // 3-5 tests visible to student
  testsPrives: TestCase[]   // 5-10 tests hidden, used for grading
  bareme: number
  difficulte: string
  reponseCorrecte: string   // Model solution (teacher reference)
  explication: string | null
}

// ─── Student Answer for CODE question ───

export interface CodingAnswer {
  code: string
  language: CodingLanguage
  testResultsPublics?: TestResult[]  // Results from student's "Run" tests
  lastSaved?: string                 // ISO timestamp of last auto-save
}

// ─── Graded Code Answer ───

export interface GradedCodingAnswer extends CodingAnswer {
  testResultsAll?: TestResult[]  // All test results (public + private)
  scoreAuto?: number             // Auto-calculated score
  scoreFinal?: number            // Final score (after teacher override)
  noteIA?: number                // AI-suggested score
  justificationIA?: string       // AI justification
  commentaireEnseignant?: string  // Teacher's comment
  overridden?: boolean           // Whether teacher overrode the auto score
}

// ─── Execution Config ───

export const EXECUTION_CONFIG = {
  timeout: 5000,           // 5 seconds max execution per test
  maxMemory: 128 * 1024,   // 128 MB in KB
  maxOutputLength: 10000,  // Max output characters
  maxCodeLength: 50000,    // Max code length in characters
  autoSaveInterval: 10000, // Auto-save every 10 seconds
  maxTestsPerExecution: 20, // Max test cases per execution
  maxExecutionsPerMinute: 15, // Rate limit: max executions per minute per user
  sandboxVersion: 2,       // Sandbox version for cache busting
} as const

// ─── Helper: Parse a function signature from any supported language ───

export interface ParsedSignature {
  funcName: string
  params: string[]       // e.g. ['nombres', 'seuil']
  returnType?: string    // e.g. 'int', 'str', 'boolean' — may be undefined for dynamic languages
}

/**
 * Parse a function signature from any supported language into a structured format.
 *
 * Handles:
 *   Python:       def ma_fonction(x, y):
 *   JavaScript:   ma_fonction(x, y)          OR  function ma_fonction(x, y)
 *   TypeScript:   ma_fonction(x: number, y: string): boolean  OR  function ma_fonction(x: number, y: string): boolean
 *   C:            int ma_fonction(int x, int y)
 *   Java:         int ma_fonction(int x, int y)
 */
export function parseFunctionSignature(signature: string): ParsedSignature | null {
  if (!signature || !signature.trim()) return null

  const s = signature.trim()

  // Python: def ma_fonction(x, y):
  let m = s.match(/^def\s+(\w+)\s*\(([^)]*)\)\s*:?$/)
  if (m) {
    return {
      funcName: m[1],
      params: splitParams(m[2]),
    }
  }

  // JS/TS with function keyword: function ma_fonction(x, y) OR function ma_fonction(x: number, y: string): boolean
  m = s.match(/^function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\w+))?\s*\{?\s*$/)
  if (m) {
    return {
      funcName: m[1],
      params: splitParams(m[2]),
      returnType: m[3] || undefined,
    }
  }

  // JS/TS without function keyword: ma_fonction(x, y) OR ma_fonction(x: number): boolean
  m = s.match(/^(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\w+))?\s*\{?\s*$/)
  if (m) {
    return {
      funcName: m[1],
      params: splitParams(m[2]),
      returnType: m[3] || undefined,
    }
  }

  // C/Java style: int ma_fonction(int x, int y) OR void ma_fonction(int x)
  m = s.match(/^(\w[\w\s*]*)\s+(\w+)\s*\(([^)]*)\)\s*\{?\s*$/)
  if (m) {
    return {
      funcName: m[2],
      params: splitParams(m[3]),
      returnType: m[1].trim(),
    }
  }

  // Fallback: try to extract just a function name with parentheses
  m = s.match(/^(\w+)\s*\(/)
  if (m) {
    const parenStart = s.indexOf('(')
    const parenEnd = s.lastIndexOf(')')
    if (parenStart >= 0 && parenEnd > parenStart) {
      return {
        funcName: m[1],
        params: splitParams(s.substring(parenStart + 1, parenEnd)),
      }
    }
  }

  return null
}

/**
 * Split parameter string into individual param names, stripping types.
 * Handles: "x, y" → ["x", "y"]
 *          "x: int, y: str" → ["x", "y"]
 *          "int x, int y" → ["x", "y"]
 *          "nombres: List[int]" → ["nombres"]
 */
function splitParams(paramsStr: string): string[] {
  if (!paramsStr.trim()) return []

  const params: string[] = []
  let depth = 0
  let current = ''

  for (const ch of paramsStr) {
    if (ch === '[' || ch === '(' || ch === '<') depth++
    else if (ch === ']' || ch === ')' || ch === '>') depth--

    if (ch === ',' && depth === 0) {
      params.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) params.push(current.trim())

  return params.map(p => {
    // Python type annotation: "x: int" → "x", "nombres: List[int]" → "nombres"
    let m = p.match(/^(\w+)\s*:/)
    if (m) return m[1]

    // C/Java/TS type prefix: "int x" → "x", "const string& name" → "name"
    m = p.match(/^(?:const\s+)?(?:\w+\s*\*?\s+)+(\w+)$/)
    if (m) return m[1]

    // Simple name: "x" → "x"
    m = p.match(/^(\w+)$/)
    if (m) return m[1]

    // TS style with type: "x: number" → "x"
    m = p.match(/^(\w+)\s*:\s*\S+/)
    if (m) return m[1]

    // Default/Rest params: "...args" → "args", "x = 5" → "x"
    m = p.match(/^\.{3}(\w+)/)
    if (m) return m[1]
    m = p.match(/^(\w+)\s*=/)
    if (m) return m[1]

    return p.replace(/[^a-zA-Z0-9_]/g, '').trim()
  }).filter(Boolean)
}

/**
 * Convert a function signature to the target language format.
 *
 * Examples:
 *   "def calculer_moyenne(nombres):" → Python: "def calculer_moyenne(nombres):"
 *                                          JS: "calculer_moyenne(nombres)"
 *                                          TS: "calculer_moyenne(nombres: any)"
 *                                          C:  "int calculer_moyenne(int nombres)"
 *                                          Java: "int calculer_moyenne(int nombres)"
 */
export function convertSignatureToLanguage(
  signature: string,
  targetLang: CodingLanguage
): string {
  const parsed = parseFunctionSignature(signature)
  if (!parsed) return signature  // Can't parse, return as-is

  const { funcName, params } = parsed

  switch (targetLang) {
    case 'python':
      return `def ${funcName}(${params.join(', ')}):`

    case 'javascript':
      return `function ${funcName}(${params.join(', ')})`

    case 'typescript':
      return `function ${funcName}(${params.map(p => `${p}: any`).join(', ')}): any`

    case 'c':
      return `int ${funcName}(${params.map(p => `int ${p}`).join(', ')})`

    case 'java':
      return `int ${funcName}(${params.map(p => `int ${p}`).join(', ')})`

    default:
      return `function ${funcName}(${params.join(', ')})`
  }
}

// ─── Helper: Create default starter code for a language ───

export function getDefaultStarterCode(lang: CodingLanguage, signature?: string): string {
  // Convert the signature to the target language format first
  const langSignature = signature ? convertSignatureToLanguage(signature, lang) : undefined

  switch (lang) {
    case 'python': {
      if (!langSignature) return '# Écrivez votre code ici\n'
      // For Python, the signature IS the def line: "def ma_fonction(x):"
      return `${langSignature}\n    # Votre code ici\n    pass`
    }
    case 'javascript': {
      if (!langSignature) return '// Écrivez votre code ici\n'
      // langSignature is already "function ma_fonction(x)"
      return `${langSignature} {\n  // Votre code ici\n}`
    }
    case 'typescript': {
      if (!langSignature) return '// Écrivez votre code ici\n'
      // langSignature is already "function ma_fonction(x: any): any"
      return `${langSignature} {\n  // Votre code ici\n}`
    }
    case 'c': {
      const sig = langSignature || 'int solution()'
      return `#include <stdio.h>\n#include <stdlib.h>\n\n${sig} {\n  // Votre code ici\n  return 0;\n}\n\nint main() {\n  // Test\n  printf("%d\\n", solution());\n  return 0;\n}`
    }
    case 'java': {
      const sig = langSignature || 'int solution()'
      return `public class Solution {\n    public static ${sig} {\n        // Votre code ici\n        return 0;\n    }\n\n    public static void main(String[] args) {\n        // Test\n        System.out.println(solution());\n    }\n}`
    }
    default:
      return '// Écrivez votre code ici\n'
  }
}

// ─── Helper: Parse coding answer from Reponse.contenu ───

export function parseCodingAnswer(contenu: string | null): CodingAnswer | null {
  if (!contenu) return null
  try {
    const parsed = JSON.parse(contenu)
    if (parsed && typeof parsed === 'object' && typeof parsed.code === 'string') {
      return parsed as CodingAnswer
    }
  } catch {
    // Not a JSON coding answer - might be a plain text answer
  }
  return null
}

// ─── Helper: Serialize coding answer for storage ───

export function serializeCodingAnswer(answer: CodingAnswer): string {
  return JSON.stringify(answer)
}
