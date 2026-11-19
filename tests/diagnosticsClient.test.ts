import { afterEach, beforeEach, expect, test, vi, type MockInstance } from 'vitest';
import { onCLS, onINP, onLCP } from 'web-vitals';

vi.mock('web-vitals', () => ({ onCLS: vi.fn(), onINP: vi.fn(), onLCP: vi.fn() }));

let windowListeners: MockInstance<typeof window.addEventListener>;
let documentListeners: MockInstance<typeof document.addEventListener>;
const transport = vi.fn<typeof fetch>();
const privacy = { doNotTrack: '0', globalPrivacyControl: false };

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv('VITE_DIAGNOSTICS_ENABLED', 'true');
  vi.stubEnv('VITE_RELEASE_SHA', 'c2843f57');
  privacy.doNotTrack = '0';
  privacy.globalPrivacyControl = false;
  vi.stubGlobal('navigator', privacy);
  transport.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', transport);
  windowListeners = vi.spyOn(window, 'addEventListener');
  documentListeners = vi.spyOn(document, 'addEventListener');
});

afterEach(() => {
  for (const [type, listener, options] of windowListeners.mock.calls) window.removeEventListener(type, listener, options);
  for (const [type, listener, options] of documentListeners.mock.calls) document.removeEventListener(type, listener, options);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test.each([undefined, 'false', 'TRUE', '1'])('client collection is disabled unless deployment opts in exactly: %s', async enabled => {
  vi.stubEnv('VITE_DIAGNOSTICS_ENABLED', enabled);
  const { startDiagnostics, reportDiagnostic } = await import('../src/lib/diagnostics');
  startDiagnostics();
  reportDiagnostic('save');
  vi.runAllTimers();
  expect(onLCP).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
});

test.each(['dnt', 'gpc'])('client collection respects %s before registering observers or listeners', async signal => {
  if (signal === 'dnt') privacy.doNotTrack = '1';
  else privacy.globalPrivacyControl = true;
  const { startDiagnostics, reportDiagnostic } = await import('../src/lib/diagnostics');
  startDiagnostics();
  reportDiagnostic('save');
  vi.runAllTimers();
  expect(onLCP).not.toHaveBeenCalled();
  expect(windowListeners).not.toHaveBeenCalled();
  expect(documentListeners).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
});

test('client batches bounded metrics, omits credentials and metadata, and starts only once', async () => {
  const { startDiagnostics, reportDiagnostic } = await import('../src/lib/diagnostics');
  startDiagnostics();
  startDiagnostics();
  expect(onLCP).toHaveBeenCalledTimes(1);
  expect(onINP).toHaveBeenCalledTimes(1);
  expect(onCLS).toHaveBeenCalledTimes(1);
  reportDiagnostic('LCP', 1234.56789);
  vi.advanceTimersByTime(9999);
  expect(transport).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(transport).toHaveBeenCalledWith('/api/diagnostics', {
    method: 'POST', body: JSON.stringify({ version: 1, release: 'c2843f57', events: [{ name: 'LCP', value: 1234.568 }] }),
    headers: { 'Content-Type': 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true,
  });
  for (let index = 0; index < 20; index++) reportDiagnostic('save', index);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(JSON.parse(String(transport.mock.calls[1][1]?.body)).events).toHaveLength(20);
  vi.runAllTimers();
  expect(transport).toHaveBeenCalledTimes(2);
});

test('hidden and pagehide flush once, using coarse errors without messages, URLs or rejected values', async () => {
  const { startDiagnostics } = await import('../src/lib/diagnostics');
  startDiagnostics();
  window.dispatchEvent(new ErrorEvent('error', { message: 'private essay', filename: 'https://example.test/?token=secret', error: new Error('private stack') }));
  const rejected = new Event('unhandledrejection');
  Object.defineProperty(rejected, 'reason', { value: 'private transcript' });
  window.dispatchEvent(rejected);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('pagehide'));
  vi.runAllTimers();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual({ version: 1, release: 'c2843f57', events: [{ name: 'unhandled-error', value: 1 }, { name: 'unhandled-rejection', value: 1 }] });
  expect(JSON.stringify(transport.mock.calls)).not.toMatch(/private|secret|example\.test/);
});

test.each(['dnt', 'gpc'])('new %s privacy signal discards queued metrics and blocks later reports', async signal => {
  const { startDiagnostics, reportDiagnostic } = await import('../src/lib/diagnostics');
  startDiagnostics();
  reportDiagnostic('save');
  if (signal === 'dnt') privacy.doNotTrack = '1';
  else privacy.globalPrivacyControl = true;
  vi.runAllTimers();
  reportDiagnostic('save-failed');
  privacy.doNotTrack = '0';
  privacy.globalPrivacyControl = false;
  window.dispatchEvent(new Event('pagehide'));
  expect(transport).not.toHaveBeenCalled();
});

test('unsupported observers and failed transports cannot interrupt application operations or retry forever', async () => {
  vi.mocked(onLCP).mockImplementationOnce(() => { throw new Error('unsupported'); });
  const { startDiagnostics, reportDiagnostic } = await import('../src/lib/diagnostics');
  expect(startDiagnostics).not.toThrow();
  expect(onINP).toHaveBeenCalledOnce();
  transport.mockImplementationOnce(() => { throw new Error('offline'); });
  reportDiagnostic('save');
  expect(() => vi.runAllTimers()).not.toThrow();
  transport.mockRejectedValueOnce(new Error('offline'));
  reportDiagnostic('save');
  await vi.runAllTimersAsync();
  expect(transport).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

test('runtime values are validated before queueing and an invalid release is omitted', async () => {
  vi.stubEnv('VITE_RELEASE_SHA', 'private@example.test');
  const { startDiagnostics, reportDiagnostic } = await import('../src/lib/diagnostics');
  startDiagnostics();
  reportDiagnostic('save', NaN);
  reportDiagnostic('save', Infinity);
  reportDiagnostic('save', -1);
  // A runtime caller can bypass TypeScript; validate at the collection boundary.
  Reflect.apply(reportDiagnostic, null, ['private essay', 1]);
  reportDiagnostic('CLS', 1234);
  vi.runAllTimers();
  expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual({ version: 1, release: 'unknown', events: [{ name: 'CLS', value: 100 }] });
});
