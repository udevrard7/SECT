/**
 * Code Sandbox Validator — Security layer for student code execution.
 *
 * Validates student code BEFORE execution to block dangerous patterns.
 * Uses regex-based analysis (works in both browser and server environments).
 *
 * Security model:
 *   1. Pre-execution validation (this file) — block dangerous patterns
 *   2. Runtime isolation (iframe / subprocess / Pyodide WASM) — contain what passes validation
 *   3. Resource limits (timeout, memory, output size) — prevent DoS
 */

import { type CodingLanguage, EXECUTION_CONFIG } from './coding-types'

// ─── Validation Result ───

export interface CodeValidationResult {
  safe: boolean
  errors: string[]
  warnings: string[]
}

// ─── Python Security Rules ───

const PYTHON_BLOCKED_IMPORTS = [
  // System access
  'os', 'sys', 'subprocess', 'shutil', 'pathlib', 'glob', 'tempfile',
  // Network
  'socket', 'http', 'urllib', 'requests', 'ftplib', 'smtplib', 'xmlrpc',
  'asyncio', 'aiohttp',
  // Code execution / introspection
  'importlib', 'pkgutil', 'code', 'codeop', 'compile', 'compileall',
  'ctypes', 'multiprocessing', 'threading', 'concurrent',
  // File system
  'io', 'fileinput', 'fnmatch', 'linecache', 'pickle', 'shelve', 'marshal',
  'dbm', 'sqlite3', 'zipfile', 'tarfile', 'gzip', 'bz2', 'lzma', 'zlib',
  // Process / signals
  'signal', 'resource', 'posix', 'pwd', 'grp', 'pty', 'fcntl', 'mmap',
  // Environment / secrets
  'platform', 'secrets', 'hashlib', 'hmac', 'ssl', 'cryptography',
  // Dangerous builtins
  'ast', 'dis', 'inspect', 'types', 'weakref', 'gc',
  // Misc dangerous
  'webbrowser', 'antigravity', 'this',
]

const PYTHON_BLOCKED_BUILTINS = [
  'eval', 'exec', 'compile', '__import__', 'open', 'input',
  'globals', 'locals', 'vars', 'dir', 'getattr', 'setattr', 'delattr',
  'hasattr', 'type', 'object', 'classmethod', 'staticmethod',
  'property', 'super', 'memoryview', 'bytearray', 'bytes',
  'breakpoint', 'exit', 'quit',
  // Dunder access patterns
  '__class__', '__bases__', '__subclasses__', '__mro__',
  '__globals__', '__builtins__', '__code__', '__func__',
]

const PYTHON_BLOCKED_PATTERNS = [
  // Direct os.system or subprocess calls
  /\bos\s*\.\s*(system|popen|execv|execve|spawn|fork|kill|getenv|environ)\b/,
  /\bsubprocess\s*\.\s*(run|call|Popen|check_output|check_call)\b/,
  // File operations
  /\bopen\s*\(\s*['"]/,
  // eval/exec with variable args
  /\b(eval|exec|compile)\s*\(/,
  // __import__ bypass
  /__import__\s*\(/,
  // Dunder access to escape sandbox
  /__\w+__\s*\[/,
  /\.\s*__\w+__/,
  // socket/network
  /\bsocket\s*\.\s*socket\b/,
  /\burllib\b/,
  /\brequests\s*\.\s*(get|post|put|delete|patch|head|options)\b/,
  // Reading environment variables
  /\bos\s*\.\s*environ/,
  // Import bypass via importlib
  /\bimportlib\s*\./,
  // Writing files
  /\bwrite\s*\(/,
  /\bwritelines\s*\(/,
  // Attempting to modify builtins
  /\b__builtins__\s*\[/,
  /\bbuiltins\s*\.\s*__/,
  // Using ctypes for FFI
  /\bctypes\s*\./,
  // Multiprocessing / threading abuse
  /\bProcess\s*\(/,
  /\bThread\s*\(/,
  // Signal manipulation
  /\bsignal\s*\.\s*(signal|alarm|kill|SIG\w*)\b/,
  // Trying to read /proc or /etc
  /['"]\/proc\//,
  /['"]\/etc\//,
  /['"]\/var\//,
  /['"]\/tmp\//,
  /['"]\/home\//,
  /['"]\/root\//,
]

// ─── JavaScript/TypeScript Security Rules ───

const JS_BLOCKED_PATTERNS = [
  // Access to globalThis/this.constructor chains
  /\bglobalThis\b/,
  /\bthis\s*\.\s*constructor\b/,
  /\bconstructor\s*\.\s*constructor\b/,
  // Prototype pollution
  /\b__proto__\b/,
  /\bprototype\s*\[/,
  // Access to window/document (in sandbox context)
  /\bwindow\b/,
  /\bdocument\b/,
  /\bself\b/,
  /\btop\b/,
  /\bparent\b/,
  /\bframes\b/,
  // eval and Function constructor
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\bnew\s+Function\b/,
  // Dynamic import
  /\bimport\s*\(/,
  // require
  /\brequire\s*\(/,
  // Process access (Node.js)
  /\bprocess\b/,
  // Global access
  /\bglobal\b/,
  // Network access attempts
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  // Web Workers
  /\bWorker\s*\(/,
  /\bSharedWorker\b/,
  /\bServiceWorker\b/,
  // Storage access
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bindexedDB\b/,
  // Cookie access
  /\bcookie\b/,
  // Navigator access (fingerprinting)
  /\bnavigator\b/,
  // Location access
  /\blocation\b/,
  // Alert/prompt/confirm
  /\balert\s*\(/,
  /\bprompt\s*\(/,
  /\bconfirm\s*\(/,
  // Dynamic script injection
  /\.innerHTML\s*=/,
  /\.outerHTML\s*=/,
  /\binsertAdjacentHTML\b/,
  // Timer abuse (infinite loops with setTimeout/setInterval)
  /\bsleep\s*\(/,
]

// ─── Python AST Validation via Regex ───

/**
 * Validate Python code for dangerous patterns.
 * This is a defense-in-depth layer — the code should ALSO run in an isolated environment.
 */
export function validatePythonCode(code: string): CodeValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Check for blocked imports
  const importRegex = /^\s*(?:import|from)\s+(\w+)/gm
  let match: RegExpExecArray | null
  while ((match = importRegex.exec(code)) !== null) {
    const moduleName = match[1]
    if (PYTHON_BLOCKED_IMPORTS.includes(moduleName)) {
      errors.push(`Import bloqué : "${moduleName}" n'est pas autorisé pour des raisons de sécurité.`)
    }
  }

  // 2. Check for blocked builtins
  for (const builtin of PYTHON_BLOCKED_BUILTINS) {
    // Match the builtin as a standalone call (not part of a larger identifier)
    const builtinRegex = new RegExp(`(?<![\\w.])${escapeRegex(builtin)}\\s*\\(`, 'g')
    if (builtinRegex.test(code)) {
      // Some builtins are allowed in specific contexts
      if (builtin === 'open') {
        // open() without arguments could be ok but we block it anyway
        errors.push(`Fonction bloquée : "${builtin}()" n'est pas autorisée.`)
      } else if (['eval', 'exec', 'compile', '__import__'].includes(builtin)) {
        errors.push(`Fonction bloquée : "${builtin}()" est interdite (exécution dynamique de code).`)
      } else if (builtin.startsWith('__')) {
        errors.push(`Accès bloqué : "${builtin}" est interdit (accès aux attributs internes).`)
      } else {
        errors.push(`Fonction bloquée : "${builtin}()" n'est pas autorisée.`)
      }
    }
  }

  // 3. Check for blocked patterns
  for (const pattern of PYTHON_BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      errors.push(`Pattern dangereux détecté : l'accès système/réseau/fichier est interdit.`)
      break // One message is enough for pattern violations
    }
  }

  // 4. Check code length
  if (code.length > EXECUTION_CONFIG.maxCodeLength) {
    errors.push(`Code trop long : maximum ${EXECUTION_CONFIG.maxCodeLength} caractères (actuel : ${code.length}).`)
  }

  // 5. Check for potential infinite loops (heuristic)
  const whileTrueRegex = /\bwhile\s+True\s*:/
  if (whileTrueRegex.test(code)) {
    warnings.push('Boucle infinie potentielle détectée (while True). Assurez-vous d\'avoir une condition de sortie.')
  }

  // 6. Check recursion depth hint
  const recursionRegex = /\bdef\s+(\w+)\s*\([^)]*\)[^:]*:\s*\n(?:[^\n]*\n)*?\1\s*\(/;
  if (recursionRegex.test(code)) {
    warnings.push('Récursion détectée. La profondeur de récursion est limitée.')
  }

  return {
    safe: errors.length === 0,
    errors,
    warnings,
  }
}

// ─── JavaScript/TypeScript Code Validation ───

/**
 * Validate JavaScript/TypeScript code for dangerous patterns.
 */
export function validateJSCode(code: string, language: 'javascript' | 'typescript'): CodeValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Check for blocked patterns
  for (const pattern of JS_BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      const desc = describeJSPattern(pattern.source)
      errors.push(`Accès bloqué : ${desc}`)
    }
  }

  // 2. Check code length
  if (code.length > EXECUTION_CONFIG.maxCodeLength) {
    errors.push(`Code trop long : maximum ${EXECUTION_CONFIG.maxCodeLength} caractères (actuel : ${code.length}).`)
  }

  // 3. Check for potential infinite loops
  const whileTrueRegex = /\bwhile\s*\(\s*true\s*\)/i
  const whileOneRegex = /\bwhile\s*\(\s*1\s*\)/
  const forNoCondition = /\bfor\s*\(\s*;\s*;\s*\)/
  if (whileTrueRegex.test(code) || whileOneRegex.test(code) || forNoCondition.test(code)) {
    warnings.push('Boucle infinie potentielle détectée. Assurez-vous d\'avoir une condition de sortie.')
  }

  // 4. Check for attempt to escape Function sandbox
  const escapePatterns = [
    /constructor\s*\[\s*/
  ]
  for (const pattern of escapePatterns) {
    if (pattern.test(code)) {
      errors.push(`Tentative d'évasion du sandbox détectée.`)
    }
  }

  // 5. TypeScript-specific: block type assertions to any that could bypass checks
  if (language === 'typescript') {
    const anyCast = /as\s+any\b/
    if (anyCast.test(code)) {
      warnings.push('Conversion vers "any" détectée. Cela peut contourner les vérifications de type.')
    }
  }

  return {
    safe: errors.length === 0,
    errors,
    warnings,
  }
}

// ─── Universal Validation Entry Point ───

/**
 * Validate code for any supported language before execution.
 */
export function validateCode(code: string, language: CodingLanguage): CodeValidationResult {
  switch (language) {
    case 'python':
      return validatePythonCode(code)
    case 'javascript':
      return validateJSCode(code, 'javascript')
    case 'typescript':
      return validateJSCode(code, 'typescript')
    case 'c':
    case 'java':
      // C/Java are not executed server-side, so validation is minimal
      return { safe: true, errors: [], warnings: ['L\'exécution C/Java n\'est pas disponible côté serveur.'] }
    default:
      return { safe: false, errors: ['Langage non supporté'], warnings: [] }
  }
}

// ─── Helpers ───

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function describeJSPattern(patternSource: string): string {
  const descriptions: Record<string, string> = {
    '\\bglobalThis\\b': 'globalThis',
    '\\bthis\\s*\\.\\s*constructor\\b': 'chaîne de constructeur (évasion sandbox)',
    '\\bconstructor\\s*\\.\\s*constructor\\b': 'chaîne de constructeur (évasion sandbox)',
    '\\b__proto__\\b': '__proto__ (pollution de prototype)',
    '\\beval\\s*\\(': 'eval() (exécution dynamique)',
    '\\bFunction\\s*\\(': 'Function() (exécution dynamique)',
    '\\bnew\\s+Function\\b': 'new Function() (exécution dynamique)',
    '\\bimport\\s*\\(': 'import() dynamique',
    '\\brequire\\s*\\(': 'require() (accès Node.js)',
    '\\bprocess\\b': 'process (accès Node.js)',
    '\\bglobal\\b': 'global (accès Node.js)',
    '\\bfetch\\s*\\(': 'fetch() (accès réseau)',
    '\\bXMLHttpRequest\\b': 'XMLHttpRequest (accès réseau)',
    '\\bWebSocket\\b': 'WebSocket (accès réseau)',
    '\\bwindow\\b': 'window (accès DOM)',
    '\\bdocument\\b': 'document (accès DOM)',
    '\\blocalStorage\\b': 'localStorage (accès stockage)',
    '\\bsessionStorage\\b': 'sessionStorage (accès stockage)',
    '\\bnavigator\\b': 'navigator (fingerprinting)',
    '\\blocation\\b': 'location (navigation)',
  }
  return descriptions[patternSource] || 'pattern dangereux'
}

// ─── Python Sandboxed Execution Wrapper ───

/**
 * Generate a Python sandbox wrapper that restricts the execution environment.
 * This wraps the student's code with builtins overrides and import hooks.
 */
export function generatePythonSandboxWrapper(studentCode: string, testCode: string): string {
  return `# ─── SECT Python Sandbox v2 ───
# Auto-generated secure execution wrapper
# DO NOT MODIFY — this is a security layer

import sys as _sys
import json as _json

# ─── Block dangerous builtins ───
_original_builtins = dict(vars(_sys.modules['builtins']))

# List of blocked builtins
_BLOCKED_BUILTINS = {
    'eval', 'exec', 'compile', '__import__', 'open', 'input',
    'globals', 'locals', 'vars', 'dir', 'getattr', 'setattr', 'delattr',
    'breakpoint', 'exit', 'quit', 'memoryview',
}

# Create restricted builtins
_restricted_builtins = {}
for _name, _value in vars(_sys.modules['builtins']).items():
    if _name in _BLOCKED_BUILTINS:
        _restricted_builtins[_name] = lambda *a, _n=_name, **kw: (_sys.stderr.write(f"BLOCKED: {_n}() is not allowed\\n"), None)[1]
    else:
        _restricted_builtins[_name] = _value

# Override __import__ to restrict module imports
_ALLOWED_MODULES = frozenset({
    'math', 'random', 'string', 'collections', 'itertools', 'functools',
    'operator', 'decimal', 'fractions', 'statistics', 'datetime', 're',
    'json', 'copy', 'enum', 'typing', 'dataclasses', 'abc',
    'array', 'heapq', 'bisect', 'pprint', 'textwrap', 'unicodedata',
    'math', 'cmath', 'numbers', 'uuid',
})

_original_import = _sys.modules['builtins'].__import__

def _restricted_import(name, *args, **kwargs):
    _top_level = name.split('.')[0]
    if _top_level not in _ALLOWED_MODULES:
        raise ImportError(f"Module '{_top_level}' is not allowed in this environment for security reasons. Allowed modules: {', '.join(sorted(_ALLOWED_MODULES))}")
    return _original_import(name, *args, **kwargs)

_restricted_builtins['__import__'] = _restricted_import

# Apply restricted builtins
_sys.modules['builtins'].__dict__.update(_restricted_builtins)

# ─── Resource limits ───
_sys.setrecursionlimit(500)  # Limit recursion depth

# ─── Capture stdout/stderr ───
from io import StringIO as _StringIO

_capture_out = _StringIO()
_capture_err = _StringIO()
_sys.stdout = _capture_out
_sys.stderr = _capture_err

# ─── Execute student code ───
_execution_error = None
try:
    exec(${JSON.stringify(studentCode)}, {**_restricted_builtins, '__builtins__': _restricted_builtins})
except Exception as _e:
    _execution_error = str(_e)

# ─── Execute test code if no error ───
if _execution_error is None:
    try:
        exec(${JSON.stringify(testCode)}, {**_restricted_builtins, '__builtins__': _restricted_builtins})
    except Exception as _e:
        _execution_error = str(_e)

# ─── Restore and output ───
_sys.stdout = _sys.__stdout__
_sys.stderr = _sys.__stderr__

_captured_output = _capture_out.getvalue()
_captured_errors = _capture_err.getvalue()
_capture_out.close()
_capture_err.close()

# Output results as JSON
_output = {
    'stdout': _captured_output,
    'stderr': _captured_errors,
    'error': _execution_error,
}
print(_json.dumps(_output, ensure_ascii=False))
`
}
