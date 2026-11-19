export const DIAGNOSTIC_NAMES = ['LCP', 'INP', 'CLS', 'workspace', 'productive', 'vocabulary', 'receptive', 'save', 'save-failed', 'module-failed', 'page-error', 'unhandled-error', 'unhandled-rejection', 'csp-script', 'csp-style', 'csp-connect', 'csp-other'] as const;
export type DiagnosticName = typeof DIAGNOSTIC_NAMES[number];
export type DiagnosticEvent = { name: DiagnosticName; value: number };
export type DiagnosticPayload = { version: 1; release: string; events: DiagnosticEvent[] };

export function diagnosticEvent(input: unknown): DiagnosticEvent | null {
  if (!input || typeof input !== 'object') return null;
  const { name, value } = input as Record<string, unknown>;
  if (typeof name !== 'string' || !DIAGNOSTIC_NAMES.includes(name as DiagnosticName)
    || typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const max = name === 'CLS' ? 100 : 120_000;
  return { name: name as DiagnosticName, value: Math.round(Math.min(max, value) * 1000) / 1000 };
}

function cspEvent(input: unknown): DiagnosticEvent | null {
  if (!input || typeof input !== 'object') return null;
  const body = input as Record<string, unknown>;
  const directive = body['effective-directive'];
  if (typeof directive !== 'string' || !directive) return null;
  const name = directive.startsWith('script-src') ? 'csp-script' : directive.startsWith('style-src') ? 'csp-style' : directive === 'connect-src' ? 'csp-connect' : 'csp-other';
  return { name, value: 1 };
}

/** Never forward messages, stack traces, URLs, account IDs or arbitrary labels. */
export function diagnosticPayload(input: unknown): DiagnosticPayload | null {
  if (!input || typeof input !== 'object') return null;
  const body = input as Record<string, unknown>;
  const csp = body['csp-report'];
  if (csp) {
    const event = cspEvent(csp);
    return event ? { version: 1, release: 'unknown', events: [event] } : null;
  }
  if (body.version !== 1 || !Array.isArray(body.events)) return null;
  const events: DiagnosticEvent[] = [];
  for (const entry of body.events.slice(0, 20)) {
    const event = diagnosticEvent(entry);
    if (event) events.push(event);
  }
  if (!events.length) return null;
  return { version: 1, release: typeof body.release === 'string' && /^[a-f0-9]{7,40}$/i.test(body.release) ? body.release : 'unknown', events };
}
