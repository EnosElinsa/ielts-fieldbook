import { afterEach, expect, test, vi } from 'vitest';
import { onRequest } from '../functions/api/diagnostics';
import { diagnosticPayload } from '../src/lib/diagnosticPayload';

afterEach(() => vi.restoreAllMocks());
const request = (body: unknown) => new Request('https://fieldbook.test/api/diagnostics', { method: 'POST', headers: { Origin: 'https://fieldbook.test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('central diagnostics retain only bounded numeric metrics and a commit identity', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const response = await onRequest({ request: request({ version: 1, release: 'c2843f57', email: 'private@example.test', events: [{ name: 'LCP', value: 1234, url: 'secret-token' }, { name: 'save-failed', value: 1, essay: 'private essay' }, { name: 'private essay', value: 1 }] }), env: {} });
  expect(response.status).toBe(204);
  expect(log).toHaveBeenCalledWith('fieldbook:diagnostics', { version: 1, release: 'c2843f57', events: [{ name: 'LCP', value: 1234 }, { name: 'save-failed', value: 1 }] });
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|secret|email|essay/);
});

test('CSP reports discard document URLs, blocked URLs and source samples at the edge', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const response = await onRequest({ request: request({ 'csp-report': { 'effective-directive': 'script-src-elem', 'document-uri': 'https://fieldbook.test/?token=secret', 'blocked-uri': 'https://private.test', 'script-sample': 'private essay' } }), env: {} });
  expect(response.status).toBe(204);
  expect(log).toHaveBeenCalledWith('fieldbook:diagnostics', { version: 1, release: 'unknown', events: [{ name: 'csp-script', value: 1 }] });
});

test('diagnostic collection rejects cross-origin and oversized requests without logging', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const crossOrigin = new Request('https://fieldbook.test/api/diagnostics', { method: 'POST', headers: { Origin: 'https://other.test' }, body: '{}' });
  expect((await onRequest({ request: crossOrigin, env: {} })).status).toBe(403);
  expect((await onRequest({ request: request({ text: 'a'.repeat(5000) }), env: {} })).status).toBe(413);
  expect(log).not.toHaveBeenCalled();
});

test('same-origin metadata cannot override a conflicting Origin or cross-site request', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const cases: HeadersInit[] = [
    { Origin: 'https://other.test', 'Sec-Fetch-Site': 'same-origin' },
    { Origin: 'https://fieldbook.test', 'Sec-Fetch-Site': 'cross-site' },
    {},
  ];
  for (const headers of cases) {
    expect((await onRequest({ request: new Request('https://fieldbook.test/api/diagnostics', { method: 'POST', headers, body: '{}' }), env: {} })).status).toBe(403);
  }
  expect(log).not.toHaveBeenCalled();
});

test('same-origin browser CSP reports work without an Origin header and optional analytics gets only sanitized fields', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const writeDataPoint = vi.fn();
  const response = await onRequest({ request: new Request('https://fieldbook.test/api/diagnostics', { method: 'POST', headers: { 'Sec-Fetch-Site': 'same-origin' }, body: JSON.stringify({ 'csp-report': { 'effective-directive': 'connect-src', 'blocked-uri': 'https://private.test/?token=secret' } }) }), env: { DIAGNOSTICS: { writeDataPoint } } });
  expect(response.status).toBe(204);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(writeDataPoint).toHaveBeenCalledWith({ blobs: ['unknown', 'csp-connect'], doubles: [1] });
});

test('malformed, missing and interrupted request bodies return a bounded error without logging', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const interrupted = request({});
  vi.spyOn(interrupted, 'body', 'get').mockReturnValue(new ReadableStream({ start(controller) { controller.error(new Error('private request body')); } }));
  for (const input of [
    new Request('https://fieldbook.test/api/diagnostics', { method: 'POST', headers: { Origin: 'https://fieldbook.test' }, body: '{invalid' }),
    new Request('https://fieldbook.test/api/diagnostics', { method: 'POST', headers: { Origin: 'https://fieldbook.test' } }),
    request({ version: 1, events: [] }),
    interrupted,
  ]) expect((await onRequest({ request: input, env: {} })).status).toBe(400);
  expect(log).not.toHaveBeenCalled();
  const method = await onRequest({ request: new Request('https://fieldbook.test/api/diagnostics'), env: {} });
  expect(method.status).toBe(405);
  expect(method.headers.get('Allow')).toBe('POST');
});

test('analytics failures are best effort and never log exception contents', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await onRequest({ request: request({ version: 1, release: 'c2843f57', events: [{ name: 'save', value: 2 }] }), env: { DIAGNOSTICS: { writeDataPoint: () => { throw new Error('private binding details'); } } } });
  expect(response.status).toBe(204);
  expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  expect(warn).not.toHaveBeenCalled();
});

test('payload validation limits event count, values, labels and release identity', () => {
  expect(diagnosticPayload({ version: 1, release: 'private@example.test', events: [
    { name: 'LCP', value: Infinity }, { name: 'INP', value: -1 }, { name: 'save', value: 'private' },
    { name: 'private essay', value: 1 }, { name: 'CLS', value: 1000 }, { name: 'LCP', value: 200_000 },
    { name: 'save', value: 1.123456 },
  ] })).toEqual({ version: 1, release: 'unknown', events: [{ name: 'CLS', value: 100 }, { name: 'LCP', value: 120_000 }, { name: 'save', value: 1.123 }] });
  expect(diagnosticPayload({ version: 1, events: Array.from({ length: 21 }, () => ({ name: 'save', value: 1 })) })?.events).toHaveLength(20);
  expect(diagnosticPayload({ 'csp-report': {} })).toBeNull();
  expect(diagnosticPayload({ version: 2, events: [{ name: 'save', value: 1 }] })).toBeNull();
});
