/**
 * Shared grading utilities for SECT platform.
 *
 * Handles:
 * - Proposition shuffling with index mapping (for melangePropositions)
 * - Conversion between shuffled-position letters and original-position letters
 * - QCU / QCM automatic grading using stored proposition mappings
 * - Detection of hybrid grading scenarios (100% auto vs. mixed auto+manual)
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

// Types of questions that require manual correction by the teacher
export const MANUAL_CORRECTION_TYPES = ['QRC', 'TRS', 'REFLEXION']

// Types of questions that can be auto-graded
export const AUTO_GRADABLE_TYPES = ['QCU', 'QCM']

// Types of questions that are semi-auto-graded (auto-calculated but teacher can override)
export const SEMI_AUTO_GRADABLE_TYPES = ['CODE']

// ─── Types ────────────────────────────────────────────────────────────────────

/** Maps each questionId to an array where mapping[shuffledIndex] = originalIndex */
export type PropositionMappings = Record<string, number[]>

export interface ShuffleResult<T> {
  shuffled: T[]
  mapping: number[] // mapping[shuffledIndex] = originalIndex
}

export interface GradeResult {
  score: number
  isAutoGraded: boolean
}

export interface GradingScenario {
  type: 'A' | 'B' // A = 100% auto-gradable, B = mixed (auto + manual)
  autoGradableCount: number
  manualCorrectionCount: number
}

// ─── Shuffle with Mapping ─────────────────────────────────────────────────────

/**
 * Shuffles an array using Fisher-Yates and returns both the shuffled result
 * and the index mapping so we can reverse the mapping later.
 *
 * mapping[shuffledIndex] = originalIndex
 * To reproduce: shuffled[i] = original[mapping[i]]
 */
export function shuffleArrayWithMapping<T>(array: T[]): ShuffleResult<T> {
  const mapping = array.map((_, i) => i) // identity mapping [0, 1, 2, ...]
  const shuffled = [...array]

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    // Swap elements
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    // Swap mapping entries correspondingly
    ;[mapping[i], mapping[j]] = [mapping[j], mapping[i]]
  }

  return { shuffled, mapping }
}

/**
 * Reconstruct the shuffled order from the original array using a stored mapping.
 * shuffled[i] = original[mapping[i]]
 */
export function applyMapping<T>(original: T[], mapping: number[]): T[] {
  return mapping.map((originalIndex) => original[originalIndex])
}

// ─── Answer Conversion ────────────────────────────────────────────────────────

/**
 * Convert a student's QCU answer from shuffled-position letter to original-position letter.
 *
 * @param studentAnswer - The letter the student selected (e.g., "B" in shuffled view)
 * @param mapping - The proposition mapping for this question
 * @returns The letter in the original proposition order
 */
export function convertShuffledLetterToOriginal(
  studentAnswer: string,
  mapping: number[]
): string {
  const shuffledIndex = LETTERS.indexOf(studentAnswer.toUpperCase())
  if (shuffledIndex === -1) return studentAnswer // Not a standard letter, return as-is
  if (shuffledIndex >= mapping.length) return studentAnswer // Out of range, return as-is
  const originalIndex = mapping[shuffledIndex]
  return LETTERS[originalIndex]
}

/**
 * Convert a student's QCM answer (array of shuffled letters) to original-position letters.
 */
export function convertShuffledLettersToOriginal(
  studentAnswers: string[],
  mapping: number[]
): string[] {
  return studentAnswers.map((letter) =>
    convertShuffledLetterToOriginal(letter, mapping)
  )
}

// ─── Grading Functions ────────────────────────────────────────────────────────

/**
 * Parse the correct answer from a JSON string or value.
 * Handles various formats: "A", ["A","C"], JSON.stringify("A"), etc.
 */
export function parseCorrectAnswer(raw: string | null | undefined): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * Grade a QCU question.
 *
 * @param studentAnswer - The student's answer (shuffled letter, e.g., "B")
 * @param correctAnswer - The correct answer in ORIGINAL order (e.g., "A")
 * @param bareme - Points for this question
 * @param mapping - Proposition mapping (shuffledIndex → originalIndex)
 * @returns The score (0 or bareme)
 */
export function gradeQCU(
  studentAnswer: string | null | undefined,
  correctAnswer: unknown,
  bareme: number,
  mapping?: number[] | null
): GradeResult {
  if (!studentAnswer) {
    return { score: 0, isAutoGraded: true }
  }

  // Convert student's shuffled answer to original position
  let answerToCompare = studentAnswer
  if (mapping && mapping.length > 0) {
    answerToCompare = convertShuffledLetterToOriginal(studentAnswer, mapping)
  }

  // Compare with correct answer (handle both string and number comparisons)
  const isCorrect =
    answerToCompare === correctAnswer ||
    answerToCompare === String(correctAnswer) ||
    String(answerToCompare).toUpperCase() === String(correctAnswer).toUpperCase()

  return {
    score: isCorrect ? bareme : 0,
    isAutoGraded: true,
  }
}

/**
 * Grade a QCM question.
 *
 * Scoring: (correctSelections - incorrectSelections) / totalCorrect * bareme
 * Minimum score is 0.
 *
 * @param studentAnswer - JSON string of student's selected letters (shuffled, e.g., '["A","C"]')
 * @param correctAnswer - Correct answers in ORIGINAL order (e.g., ["A","C"] or "A")
 * @param bareme - Points for this question
 * @param mapping - Proposition mapping
 * @returns The score (0 to bareme)
 */
export function gradeQCM(
  studentAnswer: string | null | undefined,
  correctAnswer: unknown,
  bareme: number,
  mapping?: number[] | null
): GradeResult {
  if (!studentAnswer || !correctAnswer) {
    return { score: 0, isAutoGraded: true }
  }

  let studentLetters: string[]
  try {
    studentLetters = JSON.parse(studentAnswer)
    if (!Array.isArray(studentLetters)) {
      studentLetters = [studentLetters]
    }
  } catch {
    return { score: 0, isAutoGraded: true }
  }

  // Convert shuffled letters to original positions
  if (mapping && mapping.length > 0) {
    studentLetters = convertShuffledLettersToOriginal(studentLetters, mapping)
  }

  // Normalize correct answers to array
  const correctAnswers: string[] = Array.isArray(correctAnswer)
    ? correctAnswer.map((a: unknown) => String(a).toUpperCase())
    : [String(correctAnswer).toUpperCase()]

  // Normalize student answers for comparison
  const normalizedStudent = studentLetters.map((l) => l.toUpperCase())

  const correctSelections = normalizedStudent.filter((a) =>
    correctAnswers.includes(a)
  ).length
  const incorrectSelections = normalizedStudent.filter(
    (a) => !correctAnswers.includes(a)
  ).length
  const totalCorrect = correctAnswers.length

  const score = Math.max(
    0,
    ((correctSelections - incorrectSelections) / totalCorrect) * bareme
  )

  return {
    score: Math.round(score * 100) / 100, // Round to 2 decimal places
    isAutoGraded: true,
  }
}

// ─── Scenario Detection ───────────────────────────────────────────────────────

/**
 * Detect the grading scenario for an exam.
 *
 * Scenario A: 100% auto-gradable (QCU/QCM + CODE) → Full auto-grading, immediate final results
 *   CODE questions are semi-auto: they get an auto score from test results,
 *   but the teacher can override. They don't block the scenario from being 'A'.
 * Scenario B: Mixed auto + manual correction (QRC/TRS/REFLEXION) → Partial auto + manual correction
 */
export function detectGradingScenario(
  questions: Array<{ type: string }>
): GradingScenario {
  const autoGradableCount = questions.filter((q) =>
    AUTO_GRADABLE_TYPES.includes(q.type) || SEMI_AUTO_GRADABLE_TYPES.includes(q.type)
  ).length
  const manualCorrectionCount = questions.filter((q) =>
    MANUAL_CORRECTION_TYPES.includes(q.type)
  ).length

  return {
    type: manualCorrectionCount === 0 ? 'A' : 'B',
    autoGradableCount,
    manualCorrectionCount,
  }
}

/**
 * Check if all answers for a session have been graded (score !== null).
 */
export function areAllAnswersGraded(
  reponses: Array<{ score: number | null }>
): boolean {
  return reponses.length > 0 && reponses.every((r) => r.score !== null)
}

// ─── Proposition Mappings Helpers ─────────────────────────────────────────────

/**
 * Parse propositionMappings from a JSON string stored in SessionPassation.
 */
export function parsePropositionMappings(
  raw: string | null | undefined
): PropositionMappings {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as PropositionMappings
  } catch {
    return {}
  }
}

/**
 * Serialize propositionMappings to a JSON string for storage.
 */
export function serializePropositionMappings(
  mappings: PropositionMappings
): string {
  return JSON.stringify(mappings)
}

/**
 * Build proposition mappings for all questions in an epreuve.
 * Returns the mappings to be stored on the session, and also returns
 * the shuffled propositions for each question.
 */
export function buildPropositionMappingsForSession(
  epreuveQuestions: Array<{
    questionId: string
    type: string
    propositions: string[] | null
    shouldShuffle: boolean
  }>
): { mappings: PropositionMappings; shuffledPropositions: Record<string, string[]> } {
  const mappings: PropositionMappings = {}
  const shuffledPropositions: Record<string, string[]> = {}

  for (const eq of epreuveQuestions) {
    if (
      eq.shouldShuffle &&
      eq.propositions &&
      eq.propositions.length > 0 &&
      AUTO_GRADABLE_TYPES.includes(eq.type)
    ) {
      const result = shuffleArrayWithMapping(eq.propositions)
      mappings[eq.questionId] = result.mapping
      shuffledPropositions[eq.questionId] = result.shuffled
    } else {
      // No shuffle needed, but store identity mapping for consistency
      if (eq.propositions) {
        mappings[eq.questionId] = eq.propositions.map((_, i) => i)
        shuffledPropositions[eq.questionId] = [...eq.propositions]
      }
    }
  }

  return { mappings, shuffledPropositions }
}

// ─── CODE Question Grading ──────────────────────────────────────────────────

/**
 * Grade a CODE question based on test case results.
 *
 * The score is proportional: (passedTests / totalTests) * bareme
 * This is a "semi-auto" grade - the teacher can override it manually.
 *
 * @param testResultsPublics - Results from public tests (student ran them)
 * @param testResultsAll - Results from all tests (public + private, run on submit)
 * @param bareme - Points for this question
 * @returns The auto-calculated score
 */
export function gradeCODE(
  testResultsPublics: Array<{ passed: boolean }>,
  testResultsAll: Array<{ passed: boolean }>,
  bareme: number
): GradeResult {
  // Use all tests (public + private) for final scoring
  const totalTests = testResultsAll.length
  const passedTests = testResultsAll.filter(r => r.passed).length

  if (totalTests === 0) {
    // If no test results at all, score 0
    return { score: 0, isAutoGraded: false }
  }

  const score = Math.round((passedTests / totalTests) * bareme * 100) / 100

  return {
    score,
    isAutoGraded: true, // Auto-graded but teacher can override
  }
}

/**
 * Detect if a question type is semi-auto-gradable (CODE).
 * These are auto-calculated but the teacher has the option to override.
 */
export function isSemiAutoGradable(type: string): boolean {
  return SEMI_AUTO_GRADABLE_TYPES.includes(type)
}
