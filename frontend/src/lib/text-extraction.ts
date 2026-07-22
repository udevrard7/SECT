import path from 'path'
import mammoth from 'mammoth'
import { getDocumentProxy } from 'unpdf'

export interface ExtractionResult {
  text: string
  pages?: number
  wordCount: number
}

/**
 * Extract text from a Buffer based on its MIME type
 * Compatible with Vercel serverless (no filesystem required)
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractionResult> {
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

/**
 * Extract text from a file path (legacy - requires filesystem)
 * @deprecated Use extractTextFromBuffer for Vercel compatibility
 */
export async function extractTextFromFile(
  filePath: string,
  mimeType: string
): Promise<ExtractionResult> {
  const { readFileSync } = await import('fs')
  const buffer = readFileSync(filePath)
  return extractTextFromBuffer(buffer, mimeType)
}

/**
 * Extract text from PDF using unpdf.
 * unpdf is a lightweight wrapper around pdfjs-dist designed for
 * serverless environments (Vercel, Cloudflare Workers, etc.).
 * It handles worker setup internally without requiring file:// URLs
 * or web workers, making it fully compatible with Next.js/webpack.
 */
async function extractFromPDF(buffer: Buffer): Promise<ExtractionResult> {
  const data = new Uint8Array(buffer)
  const doc = await getDocumentProxy(data)

  const numPages = doc.numPages
  const textParts: string[] = []

  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item: any) => item.str || '')
      .join(' ')
    textParts.push(pageText)
    page.cleanup()
  }

  doc.destroy()

  const text = cleanText(textParts.join('\n\n'))
  return {
    text,
    pages: numPages,
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
  try {
    const JSZip = await import('jszip')
    const zip = await JSZip.default.loadAsync(buffer)
    let text = ''

    const slideFiles = Object.keys(zip.files)
      .filter((name) => name.match(/ppt\/slides\/slide\d+\.xml$/))
      .sort()

    for (const slideFile of slideFiles) {
      const xmlContent = await zip.files[slideFile].async('string')
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
    .replace(/\f/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/gm, '')
    .replace(/Page \d+ (sur |of )\d+/gi, '')
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
