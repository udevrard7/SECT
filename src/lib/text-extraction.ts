import fs from 'fs'
import path from 'path'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'

export interface ExtractionResult {
  text: string
  pages?: number
  wordCount: number
}

/**
 * Extract text from a file based on its MIME type
 */
export async function extractTextFromFile(
  filePath: string,
  mimeType: string
): Promise<ExtractionResult> {
  const buffer = fs.readFileSync(filePath)

  switch (mimeType) {
    case 'application/pdf':
      return extractFromPDF(buffer)

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/msword':
      return extractFromDOCX(buffer)

    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return extractFromPPTX(buffer)

    case 'text/plain':
    case 'text/markdown':
      return extractFromText(buffer)

    default:
      throw new Error(`Format non supporté: ${mimeType}`)
  }
}

async function extractFromPDF(buffer: Buffer): Promise<ExtractionResult> {
  const data = await pdfParse(buffer)
  const text = cleanText(data.text)
  return {
    text,
    pages: data.numpages,
    wordCount: countWords(text),
  }
}

async function extractFromDOCX(buffer: Buffer): Promise<ExtractionResult> {
  const result = await mammoth.extractRawText({ buffer })
  const text = cleanText(result.value)
  return {
    text,
    wordCount: countWords(text),
  }
}

async function extractFromPPTX(buffer: Buffer): Promise<ExtractionResult> {
  // PPTX extraction - basic approach using mammoth-like XML parsing
  // For production, consider using pptx2json or similar
  try {
    // PPTX is a ZIP file with XML content
    // Simple extraction: try to read slide XML content
    const JSZip = await import('jszip')
    const zip = await JSZip.default.loadAsync(buffer)
    let text = ''

    const slideFiles = Object.keys(zip.files)
      .filter((name) => name.match(/ppt\/slides\/slide\d+\.xml$/))
      .sort()

    for (const slideFile of slideFiles) {
      const xmlContent = await zip.files[slideFile].async('string')
      // Extract text from XML <a:t> tags
      const textMatches = xmlContent.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || []
      const slideText = textMatches
        .map((match) => match.replace(/<a:t[^>]*>/, '').replace(/<\/a:t>/, ''))
        .join(' ')
      text += slideText + '\n\n'
    }

    text = cleanText(text)
    return {
      text,
      wordCount: countWords(text),
    }
  } catch {
    // Fallback: return empty extraction with a note
    return {
      text: '[Extraction PPTX non disponible - format non supporté]',
      wordCount: 0,
    }
  }
}

async function extractFromText(buffer: Buffer): Promise<ExtractionResult> {
  const text = cleanText(buffer.toString('utf-8'))
  return {
    text,
    wordCount: countWords(text),
  }
}

/**
 * Clean extracted text: remove extra whitespace, page numbers, headers/footers
 */
function cleanText(raw: string): string {
  return raw
    .replace(/\f/g, '\n') // Form feed -> newline
    .replace(/\r\n/g, '\n') // Windows line endings
    .replace(/\r/g, '\n') // Old Mac line endings
    .replace(/\n{3,}/g, '\n\n') // Multiple blank lines -> double
    .replace(/^\s+|\s+$/gm, '') // Trim each line
    .replace(/Page \d+ (sur |of )\d+/gi, '') // Remove page numbers
    .trim()
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  const mimeMap: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
  }
  return mimeMap[ext] || 'application/octet-stream'
}

/**
 * Check if a file type is supported
 */
export function isSupportedFileType(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase()
  return ['.pdf', '.docx', '.doc', '.pptx', '.txt', '.md'].includes(ext)
}

/**
 * Check if file size is within limit (50 MB)
 */
export function isWithinSizeLimit(fileSize: number): boolean {
  const MAX_SIZE = 50 * 1024 * 1024 // 50 MB
  return fileSize <= MAX_SIZE
}
