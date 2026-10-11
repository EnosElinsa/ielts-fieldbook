import { beforeEach, expect, test, vi } from 'vitest';
const mock = vi.hoisted(() => ({ configured: false, calls: [] as string[], rows: {} as Record<string, { id: string; payload: Record<string, unknown> }[]>, fail: false }));
vi.mock('../../src/lib/supabase', () => ({ supabaseConfigured: () => mock.configured, getSupabase: () => ({
  from: (table: string) => ({ select: () => {
    let rows = mock.rows[table] || [];
    const query = { eq: (key: string, value: unknown) => { rows = rows.filter(row => row.payload[key.replace('payload->>', '')] === value || String(row.payload[key.replace('payload->>', '')]) === String(value)); return query; },
      in: (key: string, values: string[]) => { rows = rows.filter(row => values.includes(key === 'id' ? row.id : String(row.payload[key.replace('payload->>', '')]))); return query; },
      order: () => query, range: async (start: number, end: number) => { mock.calls.push(table); return { data: rows.slice(start, end + 1), error: mock.fail ? { message: 'offline' } : null }; } };
    return query;
  } }),
  storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.example/audio' }, error: null }) }) },
}) }));
beforeEach(() => { mock.configured = false; mock.calls = []; mock.rows = {}; mock.fail = false; vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const metadata = { schemaVersion: 1, papers: [{ id: 'p', book: 0, title: 'Original demo' }], sections: [{ id: 's', paperId: 'p', skill: 'reading', status: 'ready', sentences: [] }], passages: [], questions: [], assets: [] };

test('unconfigured metadata does not load material and selected local sections load lazily', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => metadata }).mockResolvedValueOnce({ ok: true, json: async () => ({ ...metadata, questions: [{ id: 'q', sectionId: 's' }] }) });
  vi.stubGlobal('fetch', fetcher);
  const { loadExamCatalog, loadExamSections } = await import('../../src/storage/examCatalog');
  expect((await loadExamCatalog('reading')).questions).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect((await loadExamSections(['s'])).questions).toHaveLength(1);
  expect(fetcher.mock.calls[1][0]).toContain('exam-sections/s.json');
});
test('catalog fetches metadata tables only while selection reads bounded material', async () => {
  mock.configured = true;
  mock.rows = { exam_papers: [{ id: 'p', payload: { id: 'p', book: 18 } }], exam_sections: [{ id: 's', payload: { id: 's', paperId: 'p', skill: 'reading', sentences: [{ id: 'full-text' }] } }], exam_questions: [{ id: 'q', payload: { id: 'q', sectionId: 's' } }, { id: 'other', payload: { id: 'other', sectionId: 'other' } }] };
  const { loadExamCatalog, loadExamSections } = await import('../../src/storage/examCatalog');
  const catalog = await loadExamCatalog('reading', 18);
  expect(catalog.sections[0].sentences).toEqual([]);
  expect(mock.calls).toEqual(['exam_papers', 'exam_sections']);
  const selected = await loadExamSections(['s']);
  expect(selected.questions.map(row => row.id)).toEqual(['q']);
  expect(selected.sections[0].sentences).toHaveLength(1);
});
test('failures remain retryable and asset URLs are signed', async () => {
  mock.configured = true; mock.fail = true;
  const { loadExamCatalog, resolveExamAsset } = await import('../../src/storage/examCatalog');
  await expect(loadExamCatalog()).rejects.toThrow('offline');
  mock.fail = false;
  await expect(loadExamCatalog()).resolves.toHaveProperty('schemaVersion', 1);
  await expect(resolveExamAsset({ id: 'a', paperId: 'p', kind: 'audio', storagePath: 'p/audio.mp3', sourceUrl: '' } as never)).resolves.toBe('/exam-assets/p/audio.mp3');
  vi.stubEnv('DEV', false);
  await expect(resolveExamAsset({ id: 'a', paperId: 'p', kind: 'audio', storagePath: 'p/audio.mp3', sourceUrl: '' } as never)).resolves.toBe('https://signed.example/audio');
});
