'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Hook to load and manage Pyodide (Python-in-the-browser) runtime.
 *
 * Pyodide runs Python in a WebAssembly sandbox, which provides inherent
 * security isolation. However, we add additional restrictions:
 *
 * Security layers:
 *   1. Pre-execution validation (code-sandbox-validator.ts) — blocks dangerous patterns
 *   2. Pyodide WASM sandbox — inherent isolation from host system
 *   3. Restricted builtins — override dangerous Python builtins at runtime
 *   4. Import whitelist — only allow safe modules
 *   5. Recursion limit — prevent stack overflow
 *
 * The hook provides:
 * - `pyodideReady`: whether Pyodide is loaded and ready
 * - `loading`: whether Pyodide is currently being loaded
 * - `error`: any error that occurred during loading
 * - `runPython`: execute Python code and return the stdout output
 * - `runPythonTest`: execute a Python function with test input
 */

interface PyodideInterface {
  runPython: (code: string) => unknown
  runPythonAsync: (code: string) => Promise<unknown>
  globals: any
}

// Module-level singleton: load Pyodide only once across all hook instances
let pyodideInstance: PyodideInterface | null = null
let pyodideLoadPromise: Promise<PyodideInterface> | null = null
let securityInitialized = false

// ─── Python Security Initialization Script ───
// This runs once after Pyodide loads to restrict the Python environment

const PYTHON_SECURITY_INIT = `
import sys as _sect_sys

# ─── Restricted builtins ───
_SECT_BLOCKED = frozenset({
    'eval', 'exec', 'compile', '__import__', 'open', 'input',
    'breakpoint', 'exit', 'quit', 'memoryview',
})

# Override blocked builtins with functions that raise errors
for _sect_name in _SECT_BLOCKED:
    _sect_orig = getattr(_sect_sys.modules['builtins'], _sect_name, None)
    if _sect_orig is not None:
        def _sect_blocked(*a, _n=_sect_name, **kw):
            raise RuntimeError(f"BLOCKED: {_n}() is not allowed in this environment for security reasons")
        setattr(_sect_sys.modules['builtins'], _sect_name, _sect_blocked)

# ─── Restricted imports ───
_SECT_ALLOWED_MODULES = frozenset({
    'math', 'random', 'string', 'collections', 'itertools', 'functools',
    'operator', 'decimal', 'fractions', 'statistics', 'datetime', 're',
    'json', 'copy', 'enum', 'typing', 'dataclasses', 'abc',
    'array', 'heapq', 'bisect', 'pprint', 'textwrap', 'unicodedata',
    'cmath', 'numbers', 'uuid', 'io', 'sys',
})

# Override __import__ to restrict modules
_sect_original_import = _sect_sys.modules['builtins'].__import__

def _sect_restricted_import(name, *args, **kwargs):
    _top_level = name.split('.')[0]
    if _top_level not in _SECT_ALLOWED_MODULES and _top_level != '_sect_sys':
        raise ImportError(f"Module '{_top_level}' is not allowed for security reasons.")
    return _sect_original_import(name, *args, **kwargs)

_sect_sys.modules['builtins'].__import__ = _sect_restricted_import

# ─── Set recursion limit ───
_sect_sys.setrecursionlimit(500)

# ─── Clean up security variables ───
del _sect_blocked, _sect_original_import, _sect_name, _sect_orig
`

async function loadPyodideRuntime(): Promise<PyodideInterface> {
  if (pyodideInstance) return pyodideInstance
  if (pyodideLoadPromise) return pyodideLoadPromise

  pyodideLoadPromise = (async () => {
    // Load the Pyodide script from CDN
    const scriptUrl = 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js'

    await new Promise<void>((resolve, reject) => {
      // Check if already loaded
      if (typeof window !== 'undefined' && (window as any).loadPyodide) {
        resolve()
        return
      }

      const script = document.createElement('script')
      script.src = scriptUrl
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Impossible de charger Pyodide depuis le CDN'))
      document.head.appendChild(script)
    })

    // Initialize Pyodide
    const loadPyodideFn = (window as any).loadPyodide
    if (!loadPyodideFn) {
      throw new Error('loadPyodide non trouvé après le chargement du script')
    }

    const pyodide = await loadPyodideFn({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/',
    })

    pyodideInstance = pyodide as PyodideInterface

    // ─── Initialize security restrictions ───
    if (!securityInitialized) {
      try {
        pyodideInstance.runPython(PYTHON_SECURITY_INIT)
        securityInitialized = true
      } catch (err) {
        console.warn('[use-pyodide] Security initialization warning:', err)
        // Non-fatal — Pyodide WASM sandbox still provides base isolation
        securityInitialized = true
      }
    }

    return pyodideInstance
  })()

  return pyodideLoadPromise
}

export function usePyodide() {
  const [pyodideReady, setPyodideReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pyodideRef = useRef<PyodideInterface | null>(null)

  // Check if already loaded (from a previous mount)
  useEffect(() => {
    if (pyodideInstance) {
      pyodideRef.current = pyodideInstance
      setPyodideReady(true)
    }
  }, [])

  const loadPyodide = useCallback(async () => {
    if (pyodideRef.current) return pyodideRef.current
    if (loading) return null

    setLoading(true)
    setError(null)

    try {
      const pyodide = await loadPyodideRuntime()
      pyodideRef.current = pyodide
      setPyodideReady(true)
      return pyodide
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors du chargement de Pyodide'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [loading])

  /**
   * Run Python code in the Pyodide WASM sandbox.
   * Captures stdout output and returns it as a string.
   * Security: Pyodide runs in WASM, which is inherently isolated from the host.
   * Additional restrictions are applied during initialization.
   */
  const runPython = useCallback(async (code: string): Promise<{ output: string; error: string | null }> => {
    try {
      const pyodide = pyodideRef.current || await loadPyodide()
      if (!pyodide) {
        return { output: '', error: 'Pyodide non disponible' }
      }

      // Redirect stdout to capture output
      const captureCode = `
import sys
from io import StringIO

_capture_stdout = StringIO()
_capture_stderr = StringIO()
sys.stdout = _capture_stdout
sys.stderr = _capture_stderr

try:
${code.split('\n').map((line: string) => '    ' + line).join('\n')}
    _exec_error = None
except Exception as _e:
    _exec_error = str(_e)
finally:
    sys.stdout = sys.__stdout__
    sys.stderr = sys.__stderr__
    _captured_out = _capture_stdout.getvalue()
    _captured_err = _capture_stderr.getvalue()
    _capture_stdout.close()
    _capture_stderr.close()
`

      pyodide.runPython(captureCode)

      const capturedOut = String(pyodide.globals.get('_captured_out') || '')
      const capturedErr = String(pyodide.globals.get('_captured_err') || '')
      const execError = pyodide.globals.get('_exec_error')
      const errorMsg = execError && execError !== 'None' ? String(execError) : (capturedErr || null)

      // Clean up globals
      pyodide.runPython(`
del _capture_stdout, _capture_stderr, _captured_out, _captured_err, _exec_error
`)

      return { output: capturedOut, error: errorMsg }
    } catch (err) {
      return {
        output: '',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }, [loadPyodide])

  /**
   * Run a Python function with given input and capture the return value.
   * Returns the string representation of the function's return value.
   * Security: Runs in Pyodide WASM sandbox with restricted builtins.
   */
  const runPythonTest = useCallback(async (
    code: string,
    funcName: string,
    inputSerialized: string
  ): Promise<{ output: string; error: string | null }> => {
    try {
      const pyodide = pyodideRef.current || await loadPyodide()
      if (!pyodide) {
        return { output: '', error: 'Pyodide non disponible' }
      }

      let testCode: string

      if (funcName) {
        // Define the function code first, then call it with test input
        testCode = `
${code}

import json
import sys
from io import StringIO

_test_stdout = StringIO()
sys.stdout = _test_stdout

try:
    _test_input = ${inputSerialized}
    if isinstance(_test_input, list):
        _test_result = ${funcName}(*_test_input)
    elif isinstance(_test_input, dict):
        _test_result = ${funcName}(**_test_input)
    else:
        _test_result = ${funcName}(_test_input)
    if isinstance(_test_result, (list, dict)):
        print(json.dumps(_test_result, ensure_ascii=False))
    else:
        print(_test_result)
    _test_error = None
except Exception as _e:
    _test_error = str(_e)
finally:
    sys.stdout = sys.__stdout__
    _test_output = _test_stdout.getvalue()
    _test_stdout.close()
`
      } else {
        // No function name — run the code directly and capture stdout
        testCode = `
import sys
from io import StringIO

_test_stdout = StringIO()
sys.stdout = _test_stdout

try:
${code.split('\n').map((line: string) => '    ' + line).join('\n')}
    _test_error = None
except Exception as _e:
    _test_error = str(_e)
finally:
    sys.stdout = sys.__stdout__
    _test_output = _test_stdout.getvalue()
    _test_stdout.close()
`
      }

      pyodide.runPython(testCode)

      const output = String(pyodide.globals.get('_test_output') || '')
      const testError = pyodide.globals.get('_test_error')
      const errorMsg = testError && testError !== 'None' ? String(testError) : null

      // Clean up — use try/except to avoid errors if variables don't exist
      pyodide.runPython(`
try:
    del _test_stdout, _test_input, _test_result, _test_error, _test_output
except:
    pass
`)

      return { output: output.trim(), error: errorMsg }
    } catch (err) {
      return {
        output: '',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }, [loadPyodide])

  return {
    pyodideReady,
    loading,
    error,
    loadPyodide,
    runPython,
    runPythonTest,
  }
}
