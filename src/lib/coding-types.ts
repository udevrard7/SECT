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
  timeout: 5000,       // 5 seconds max execution
  maxMemory: 128 * 1024, // 128 MB in KB
  maxOutputLength: 10000, // Max output characters
  autoSaveInterval: 10000, // Auto-save every 10 seconds
} as const

// ─── Helper: Create default starter code for a language ───

export function getDefaultStarterCode(lang: CodingLanguage, signature?: string): string {
  switch (lang) {
    case 'python':
      return signature
        ? `${signature}\n    # Votre code ici\n    pass`
        : `# Écrivez votre code ici\n`
    case 'javascript':
      return signature
        ? `function ${signature} {\n  // Votre code ici\n}`
        : `// Écrivez votre code ici\n`
    case 'typescript':
      return signature
        ? `function ${signature}: any {\n  // Votre code ici\n}`
        : `// Écrivez votre code ici\n`
    case 'c':
      return `#include <stdio.h>\n#include <stdlib.h>\n\n${signature || 'int solution()'} {\n  // Votre code ici\n  return 0;\n}\n\nint main() {\n  // Test\n  printf("%d\\n", solution());\n  return 0;\n}`
    case 'java':
      return `public class Solution {\n    public static ${signature || 'int solution()'} {\n        // Votre code ici\n        return 0;\n    }\n\n    public static void main(String[] args) {\n        // Test\n        System.out.println(solution());\n    }\n}`
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
