'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Hook to load and manage Pyodide (Python-in-the-browser) runtime.
 *
 * Pyodide is loaded from CDN lazily on first use. Once loaded, it's cached
 * for the lifetime of the page. The hook provides:
 * - `pyodideReady`: whether Pyodide is loaded and ready
 * - `loading`: whether Pyodide is currently being loaded
 * - `error`: any error that occurred during loading
 * - `runPython`: execute Python code and return the stdout output
 * - `runPythonAsync`: execute Python code asynchronously
 */

interface PyodideInterface {
  runPython: (code: string) => unknown
  runPythonAsync: (code: string) => Promise<unknown>
  globals: any
}

// Module-level singleton: load Pyodide only once across all hook instances
let pyodideInstance: PyodideInterface | null = null
let pyodideLoadPromise: Promise<PyodideInterface> | null = null

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
   * Run Python code in the Pyodide sandbox.
   * Captures stdout output and returns it as a string.
   * If Pyodide is not loaded, loads it first.
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
${code}

import sys
from io import StringIO

_test_stdout = StringIO()
sys.stdout = _test_stdout

try:
    exec(open('${''}').read() if False else None)  # no-op placeholder
    _test_error = None
except Exception as _e:
    _test_error = str(_e)
finally:
    sys.stdout = sys.__stdout__
    _test_output = _test_stdout.getvalue()
    _test_stdout.close()
`
        // For no-function mode, just execute the code and capture stdout
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
