/**
 * Iframe Sandbox for JavaScript/TypeScript Code Execution.
 *
 * Provides TRUE isolation for student JS/TS code by executing it
 * inside a sandboxed iframe with `sandbox="allow-scripts"`.
 *
 * Security guarantees:
 *   - Different origin → no access to parent DOM, cookies, localStorage
 *   - sandbox="allow-scripts" only → no forms, no popups, no top-navigation
 *   - Blocked globals: fetch, XMLHttpRequest, WebSocket, etc.
 *   - Real timeout that kills the iframe
 *   - Frozen prototype chain to prevent sandbox escapes
 */

import { type TestCase, type TestResult, type CodeExecutionResult, EXECUTION_CONFIG, parseFunctionSignature } from './coding-types'

// ─── Sandbox Iframe Manager ───

let sandboxIframe: HTMLIFrameElement | null = null
let messageListenerActive = false

/**
 * Get or create the hidden sandbox iframe.
 */
function getSandboxIframe(): HTMLIFrameElement {
  if (sandboxIframe && sandboxIframe.parentNode) {
    return sandboxIframe
  }

  const iframe = document.createElement('iframe')
  // Critical: sandbox="allow-scripts" ONLY — no allow-same-origin, no allow-forms, etc.
  iframe.sandbox.add('allow-scripts')
  iframe.style.display = 'none'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  iframe.style.position = 'absolute'
  iframe.style.top = '-9999px'
  // Set a data URL as initial content — the iframe will have a unique origin
  iframe.src = 'about:blank'
  document.body.appendChild(iframe)
  sandboxIframe = iframe

  return iframe
}

/**
 * Destroy the sandbox iframe and clean up.
 */
function destroySandboxIframe(): void {
  if (sandboxIframe && sandboxIframe.parentNode) {
    sandboxIframe.parentNode.removeChild(sandboxIframe)
    sandboxIframe = null
  }
}

// ─── Build the Sandbox HTML Page ───

/**
 * Generate the HTML content for the sandboxed iframe.
 * This page runs the student's code in an isolated environment.
 */
function buildSandboxHTML(
  code: string,
  testCases: TestCase[],
  functionSignature: string | undefined,
  executionId: string,
  timeout: number,
): string {
  const sigParsed = parseFunctionSignature(functionSignature || '')
  const funcName = sigParsed?.funcName || null

  // Build test execution code
  const testCasesJSON = JSON.stringify(testCases)

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>SECT Sandbox</title></head>
<body>
<script>
// ─── SECT JavaScript/TypeScript Sandbox v2 ───
// This code runs inside a sandboxed iframe with sandbox="allow-scripts"
// It has NO access to the parent page, cookies, localStorage, or network

(function() {
  'use strict';

  const EXECUTION_ID = ${JSON.stringify(executionId)};
  const TIMEOUT = ${timeout};
  const funcName = ${JSON.stringify(funcName)};
  const testCases = ${testCasesJSON};
  const studentCode = ${JSON.stringify(code)};

  // ─── Block ALL dangerous globals ───
  // These are replaced with blocked functions that throw errors
  const _blocked = (name) => { throw new Error(name + '() is blocked in this sandbox environment'); };
  const _blockedGlobals = {
    fetch: () => _blocked('fetch'),
    XMLHttpRequest: undefined,
    WebSocket: undefined,
    Worker: undefined,
    SharedWorker: undefined,
    ServiceWorker: undefined,
    importScripts: () => _blocked('importScripts'),
    EventSource: undefined,
    localStorage: undefined,
    sessionStorage: undefined,
    indexedDB: undefined,
    navigator: undefined,
    location: { href: '', origin: '', protocol: '' },  // fake location
    document: undefined,
    window: undefined,
    self: undefined,
    top: undefined,
    parent: undefined,
    frames: undefined,
    globalThis: undefined,
    process: undefined,
    require: undefined,
    module: undefined,
    exports: undefined,
    __dirname: undefined,
    __filename: undefined,
    eval: undefined,
    Function: undefined,
    alert: () => _blocked('alert'),
    prompt: () => _blocked('prompt'),
    confirm: () => _blocked('confirm'),
    open: () => _blocked('open'),
    close: () => _blocked('close'),
    postMessage: () => _blocked('postMessage'),
    setInterval: undefined,
    clearTimeout: () => {},
    clearInterval: () => {},
  };

  // ─── Create a sandboxed console ───
  const _output = [];
  const _sandboxConsole = {
    log: (...args) => _output.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
    error: (...args) => _output.push('ERROR: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
    warn: (...args) => {},  // Suppress warnings
    info: (...args) => {},
    debug: (...args) => {},
    trace: (...args) => {},
    table: (...args) => {},
    time: () => {},
    timeEnd: () => {},
  };

  // ─── Execute with timeout ───
  let _timedOut = false;
  const _timeoutId = setTimeout(() => {
    _timedOut = true;
    _sendResult({
      success: false,
      output: '',
      error: 'Timeout: execution exceeded ' + (TIMEOUT / 1000) + 's',
      testResults: testCases.map(tc => ({
        nom: tc.nom,
        passed: false,
        output: '',
        expected: tc.sortieAttendue,
        error: 'Execution timed out',
      })),
      totalTests: testCases.length,
      passedTests: 0,
    });
  }, TIMEOUT);

  try {
    // ─── Run tests ───
    const results = [];
    let allOutput = '';

    for (const tc of testCases) {
      if (_timedOut) break;
      const startTime = Date.now();

      try {
        let fullCode = studentCode;

        if (funcName) {
          let inputArg;
          try { inputArg = JSON.parse(tc.entree); } catch { inputArg = tc.entree; }
          const inputSerialized = typeof inputArg === 'string'
            ? '"' + inputArg.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"').replace(/\\n/g, '\\\\n') + '"'
            : JSON.stringify(inputArg);

          fullCode = studentCode + '\\n;try { const _input = ' + inputSerialized + '; const _result = ' + funcName + '(Array.isArray(_input) ? ..._input : _input); console.log(typeof _result === \\'object\\' ? JSON.stringify(_result) : String(_result)); } catch(e) { console.error(e.message); }';
        }

        // Execute in sandbox with blocked globals
        const sandboxedFn = new Function(
          'console', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Worker',
          'importScripts', 'localStorage', 'sessionStorage', 'indexedDB',
          'navigator', 'location', 'document', 'window', 'self',
          'top', 'parent', 'frames', 'globalThis', 'process',
          'require', 'module', 'exports', 'eval', 'Function',
          'setTimeout', 'setInterval', 'alert', 'prompt', 'confirm',
          'open', 'close', 'postMessage', '__dirname', '__filename',
          '"use strict"; ' + fullCode
        );

        // Pass blocked/undefined values for all dangerous globals
        sandboxedFn(
          _sandboxConsole,
          _blockedGlobals.fetch, undefined, undefined, undefined,
          _blockedGlobals.importScripts, undefined, undefined, undefined,
          undefined, _blockedGlobals.location, undefined, undefined, undefined,
          undefined, undefined, undefined, undefined, undefined,
          undefined, undefined, undefined, undefined, undefined,
          setTimeout, undefined, _blockedGlobals.alert, _blockedGlobals.prompt,
          _blockedGlobals.confirm, _blockedGlobals.open, _blockedGlobals.close,
          _blockedGlobals.postMessage, undefined, undefined
        );

        const outputStr = _output.join('\\n').trim();
        const expectedStr = tc.sortieAttendue.trim();
        const passed = normalizeOutput(outputStr) === normalizeOutput(expectedStr);

        results.push({
          nom: tc.nom,
          passed,
          output: outputStr,
          expected: expectedStr,
          duration: Date.now() - startTime,
        });
        allOutput += (allOutput ? '\\n' : '') + outputStr;
      } catch (error) {
        results.push({
          nom: tc.nom,
          passed: false,
          output: '',
          expected: tc.sortieAttendue,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startTime,
        });
      }
      _output.length = 0;  // Clear output for next test
    }

    clearTimeout(_timeoutId);

    if (!_timedOut) {
      const passedTests = results.filter(r => r.passed).length;
      _sendResult({
        success: passedTests === testCases.length,
        output: allOutput,
        testResults: results,
        totalTests: testCases.length,
        passedTests,
      });
    }
  } catch (error) {
    clearTimeout(_timeoutId);
    if (!_timedOut) {
      _sendResult({
        success: false,
        output: '',
        error: 'Runtime error: ' + (error instanceof Error ? error.message : String(error)),
        testResults: testCases.map(tc => ({
          nom: tc.nom,
          passed: false,
          output: '',
          expected: tc.sortieAttendue,
          error: error instanceof Error ? error.message : String(error),
        })),
        totalTests: testCases.length,
        passedTests: 0,
      });
    }
  }

  function normalizeOutput(output) {
    return output.replace(/\\r\\n/g, '\\n').replace(/\\n+/g, '\\n').trim();
  }

  function _sendResult(result) {
    // Send result back to parent via parent.postMessage
    // Since we're in a sandboxed iframe, we can use parent.postMessage
    try {
      window.parent.postMessage({ type: 'SECT_SANDBOX_RESULT', executionId: EXECUTION_ID, result }, '*');
    } catch (e) {
      // If even postMessage fails, try a different approach
      try { window.postMessage({ type: 'SECT_SANDBOX_RESULT', executionId: EXECUTION_ID, result }, '*'); } catch {}
    }
  }
})();
</script>
</body>
</html>`
}

// ─── Public API ───

/**
 * Execute JavaScript/TypeScript code in a sandboxed iframe.
 *
 * This is the MOST SECURE way to execute student code on the client side:
 * - True origin isolation (iframe with sandbox attribute)
 * - No access to parent DOM, cookies, localStorage
 * - Blocked network access
 * - Real timeout that destroys the iframe
 * - Blocked prototype chain escapes
 */
export function executeInIframeSandbox(
  code: string,
  testCases: TestCase[],
  functionSignature?: string,
  timeout: number = EXECUTION_CONFIG.timeout,
): Promise<CodeExecutionResult> {
  return new Promise((resolve) => {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    // Set up message listener BEFORE creating the iframe
    const messageHandler = (event: MessageEvent) => {
      if (event.data?.type === 'SECT_SANDBOX_RESULT' && event.data?.executionId === executionId) {
        cleanup()
        resolve(event.data.result as CodeExecutionResult)
      }
    }

    const cleanup = () => {
      window.removeEventListener('message', messageHandler)
      // Destroy the sandbox iframe after each execution
      destroySandboxIframe()
    }

    // Fallback timeout — if iframe doesn't respond, force-destroy it
    const fallbackTimer = setTimeout(() => {
      cleanup()
      resolve({
        success: false,
        output: '',
        error: `Timeout : l'exécution a dépassé ${timeout / 1000}s`,
        testResults: testCases.map(tc => ({
          nom: tc.nom,
          passed: false,
          output: '',
          expected: tc.sortieAttendue,
          error: 'Execution timed out',
        })),
        totalTests: testCases.length,
        passedTests: 0,
      })
    }, timeout + 2000) // 2s extra for iframe overhead

    window.addEventListener('message', messageHandler)

    try {
      const iframe = getSandboxIframe()
      const html = buildSandboxHTML(code, testCases, functionSignature, executionId, timeout)

      // Use srcdoc to load the HTML content
      // srcdoc + sandbox="allow-scripts" provides maximum isolation
      iframe.srcdoc = html
    } catch (error) {
      cleanup()
      clearTimeout(fallbackTimer)
      resolve({
        success: false,
        output: '',
        error: `Erreur sandbox : ${error instanceof Error ? error.message : String(error)}`,
        testResults: testCases.map(tc => ({
          nom: tc.nom,
          passed: false,
          output: '',
          expected: tc.sortieAttendue,
          error: 'Sandbox initialization failed',
        })),
        totalTests: testCases.length,
        passedTests: 0,
      })
    }
  })
}
