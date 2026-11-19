import { onCLS, onINP, onLCP } from 'web-vitals';
import { diagnosticEvent, diagnosticPayload, type DiagnosticEvent, type DiagnosticName } from './diagnosticPayload';

let active = false;
let events: DiagnosticEvent[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
const permitted = () => navigator.doNotTrack !== '1' && !(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;

export function reportDiagnostic(name: DiagnosticName, value = 1) {
  if (!active || !permitted()) return;
  const event = diagnosticEvent({ name, value });
  if (!event) return;
  events.push(event);
  if (events.length >= 20) flush();
  else timer ??= setTimeout(flush, 10_000);
}

function flush() {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  const payload = diagnosticPayload({ version: 1, release: import.meta.env.VITE_RELEASE_SHA, events });
  events = [];
  if (!payload || !permitted()) return;
  try {
    void fetch('/api/diagnostics', { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true }).catch(() => {});
  } catch { /* Diagnostics must never interrupt a save or navigation. */ }
}

/** Explicit deployment opt-in; no identifiers, content, messages, stack traces or URLs. */
export function startDiagnostics() {
  if (active || import.meta.env.VITE_DIAGNOSTICS_ENABLED !== 'true' || !permitted()) return;
  active = true;
  for (const observe of [onLCP, onINP, onCLS]) {
    try { observe(({ name, value }) => reportDiagnostic(name, value)); }
    catch { /* Unsupported performance APIs must not prevent startup. */ }
  }
  window.addEventListener('error', () => reportDiagnostic('unhandled-error'));
  window.addEventListener('unhandledrejection', () => reportDiagnostic('unhandled-rejection'));
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}
