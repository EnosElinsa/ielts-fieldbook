import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { clearReadCache } from '../../src/lib/readCache';
import { resetAccountIdentity, setAccountIdentity } from '../../src/storage/accountIdentity';
import laki from '../../src/features/exam/fixtures/cambridge-18-listening-evidence.json';
const mock = vi.hoisted(() => ({ configured: false, calls: [] as string[], rows: {} as Record<string, { id: string; payload: Record<string, unknown> }[]>, fail: false, signedCalls: 0, stallSigning: false }));
vi.mock('../../src/lib/supabase', () => ({ supabaseConfigured: () => mock.configured, getSupabase: () => ({
  from: (table: string) => ({ select: () => {
    let rows = mock.rows[table] || [];
    const query = { eq: (key: string, value: unknown) => { rows = rows.filter(row => row.payload[key.replace('payload->>', '')] === value || String(row.payload[key.replace('payload->>', '')]) === String(value)); return query; },
      in: (key: string, values: string[]) => { rows = rows.filter(row => values.includes(key === 'id' ? row.id : String(row.payload[key.replace('payload->>', '')]))); return query; },
      order: () => query, range: async (start: number, end: number) => { mock.calls.push(table); return { data: rows.slice(start, end + 1), error: mock.fail ? { message: 'offline' } : null }; } };
    return query;
  } }),
  storage: { from: () => ({ createSignedUrl: async () => { mock.signedCalls++; if(mock.stallSigning) await new Promise(()=>{}); return { data: { signedUrl: 'https://signed.example/audio' }, error: null }; } }) },
}) }));
beforeEach(() => { clearReadCache(); resetAccountIdentity(); mock.configured = false; mock.calls = []; mock.rows = {}; mock.fail = false; mock.signedCalls = 0; mock.stallSigning = false; vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterEach(() => { vi.useRealTimers(); });
const metadata = { schemaVersion: 1, papers: [{ id: 'p', book: 0, title: 'Original demo' }], sections: [{ id: 's', paperId: 'p', skill: 'reading', status: 'ready', sentences: [] }], passages: [], questions: [], assets: [] };

test.each([false, true])('published transcripts remove imported analysis controls without changing IDs, timings or stored data (remote: %s)', async configured => {
  const section = structuredClone(laki.section);
  const questions = Array.from({length:section.questionCount}, (_,index)=>({id:`q${index+1}`,sectionId:section.id,number:index+1,type:'gap'}));
  const before = structuredClone(section);
  mock.configured = configured;
  mock.rows = { exam_sections: [{ id: section.id, payload: section }], exam_papers: [{ id: section.paperId, payload: { id: section.paperId } }], exam_questions: questions.map(question=>({id:question.id,payload:question})) };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...metadata, sections: [section], questions }) }));
  const { loadExamSections } = await import('../../src/storage/examCatalog');
  const loaded = (await loadExamSections([section.id])).sections[0];
  expect(loaded.sentences.some(sentence => sentence.text.includes('Q解析'))).toBe(false);
  expect(loaded.sentences).toEqual(before.sentences.map(sentence => ({ ...sentence, text: sentence.text.replace(/\s*Q解析/g, '') })));
  expect(section).toEqual(before);
});

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

test('metadata and section revisits reuse scoped content while reload bypasses fresh data', async () => {
  const fetcher = vi.fn().mockImplementation(async () => ({ ok: true, json: async () => metadata }));
  vi.stubGlobal('fetch', fetcher);
  const { loadExamCatalog, loadExamSections } = await import('../../src/storage/examCatalog');
  await Promise.all([loadExamCatalog('reading', 0), loadExamCatalog('reading', 0)]);
  await loadExamCatalog('reading', 0);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await Promise.all([loadExamSections(['s']), loadExamSections(['s', 's'])]);
  await loadExamSections(['s']);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await loadExamCatalog('reading', 0, { force: true });
  expect(fetcher).toHaveBeenCalledTimes(3);
  setAccountIdentity('different-account');
  await loadExamCatalog('reading', 0);
  expect(fetcher).toHaveBeenCalledTimes(4);
});

test('signed URLs are reused but re-signed before the expiry safety window', async () => {
  vi.useFakeTimers(); vi.stubEnv('DEV', false); mock.configured = true;
  const { resolveExamAsset } = await import('../../src/storage/examCatalog');
  const asset = { id: 'a', paperId: 'p', kind: 'audio', storagePath: 'p/audio.mp3', sourceUrl: '' } as never;
  await Promise.all([resolveExamAsset(asset), resolveExamAsset(asset)]);
  expect(mock.signedCalls).toBe(1);
  vi.advanceTimersByTime(3_539_999);
  await resolveExamAsset(asset);
  expect(mock.signedCalls).toBe(1);
  vi.advanceTimersByTime(1);
  await resolveExamAsset(asset);
  expect(mock.signedCalls).toBe(2);
  await resolveExamAsset(asset, { force: true });
  expect(mock.signedCalls).toBe(3);
});

test('a stalled recording URL times out so retry can obtain a fresh URL', async () => {
  vi.useFakeTimers(); vi.stubEnv('DEV', false); mock.configured=true; mock.stallSigning=true;
  const {resolveExamAsset}=await import('../../src/storage/examCatalog');
  const asset={id:'audio',paperId:'p',kind:'audio',storagePath:'p/audio.mp3',sourceUrl:''} as never;
  const rejected=expect(resolveExamAsset(asset)).rejects.toThrow(/too long/i);
  await vi.advanceTimersByTimeAsync(15_001);
  await rejected;
  mock.stallSigning=false;
  await expect(resolveExamAsset(asset)).resolves.toBe('https://signed.example/audio');
  expect(mock.signedCalls).toBe(2);
});

test.each([false,true])('selected material rejects a truncated thirteen-question passage and remains retryable (remote: %s)', async configured => {
  const section={id:'source:1238',paperId:'p',skill:'reading',questionCount:13,sentences:[]};
  const questions=Array.from({length:13},(_,index)=>({id:`q${index+1}`,sectionId:section.id,number:index+1,type:index<6?'gap':'true-false',points:1}));
  mock.configured=configured;
  mock.rows={exam_sections:[{id:section.id,payload:section}],exam_papers:[],exam_questions:questions.slice(0,7).map(question=>({id:question.id,payload:question}))};
  const fetcher=vi.fn().mockImplementation(async()=>({ok:true,json:async()=>({...metadata,sections:[section],questions:questions.slice(0,7)})}));
  vi.stubGlobal('fetch',fetcher);
  const {loadExamSections}=await import('../../src/storage/examCatalog');
  await expect(loadExamSections([section.id])).rejects.toThrow(/incomplete.*13.*7/i);
  mock.rows.exam_questions=questions.map(question=>({id:question.id,payload:question}));
  fetcher.mockImplementation(async()=>({ok:true,json:async()=>({...metadata,sections:[section],questions})}));
  await expect(loadExamSections([section.id])).resolves.toHaveProperty('questions',questions);
});

test.each(['metadata','sections'])('a stalled %s request times out and a later read retries successfully', async resource => {
  vi.useFakeTimers();
  const fetcher=vi.fn().mockImplementationOnce(()=>new Promise(()=>{})).mockResolvedValue({ok:true,json:async()=>metadata});
  vi.stubGlobal('fetch',fetcher);
  const {loadExamCatalog,loadExamSections}=await import('../../src/storage/examCatalog');
  const read=()=>resource==='metadata'?loadExamCatalog('reading'):loadExamSections(['s']);
  const pending=read();
  const rejected=expect(pending).rejects.toThrow(/too long/i);
  await vi.advanceTimersByTimeAsync(15_001);
  await rejected;
  await expect(read()).resolves.toHaveProperty('schemaVersion',1);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
