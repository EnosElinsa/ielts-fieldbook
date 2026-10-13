import { getSupabase, supabaseConfigured } from '../lib/supabase';
import type { ExamAsset, ExamCatalog, ExamPaper, ExamSection, ExamSkill } from '../domain/exam/types';
import { cachedRead, readCacheKey, type ReadOptions } from '../lib/readCache';
import { accountGeneration, accountId } from './accountIdentity';

const contentVersion = 'exam-v1';
const scopedKey = (resource: string, params: unknown) => readCacheKey(accountId(), contentVersion, resource, [accountGeneration(), import.meta.env.DEV, import.meta.env.BASE_URL, supabaseConfigured(), params]);
const selectedIds = (ids: string[]) => [...new Set(ids.filter(Boolean))].sort();
export const examCatalogKey = (skill?: ExamSkill, book?: number) => scopedKey('metadata', [skill, book]);
export const examSectionsKey = (ids: string[]) => scopedKey('sections', selectedIds(ids));
export const examAssetKey = (asset: ExamAsset) => scopedKey('asset-url', [asset.id, asset.storagePath]);
export const EXAM_ASSET_REFRESH_MS = 3_540_000;

const emptyCatalog = (): ExamCatalog => ({ schemaVersion: 1, papers: [], sections: [], passages: [], questions: [], assets: [] });
const missingRelation = (error: { code?: string; message?: string }) => ['42P01', 'PGRST205'].includes(error.code || '') || /relation .* does not exist|could not find .* table/i.test(error.message || '');
function failure(error: { message?: string }, fallback: string) { return new Error(error.message || fallback); }

function parseCatalog(value: unknown): ExamCatalog {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid exam catalog.');
  const source = value as Record<string, unknown>;
  if (source.schemaVersion !== 1) throw new Error('Unsupported exam catalog version.');
  const result = emptyCatalog();
  for (const key of ['papers', 'sections', 'passages', 'questions', 'assets'] as const) {
    if (!Array.isArray(source[key])) throw new Error(`Exam catalog ${key} must be a list.`);
    (result[key] as unknown[]) = source[key];
  }
  return result;
}

async function localCatalog(path: string, optional = false): Promise<ExamCatalog> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${path}`);
  if (!response.ok) {
    if (optional && response.status === 404) return emptyCatalog();
    throw new Error('Unable to load exam content. Please retry.');
  }
  return parseCatalog(await response.json());
}

type Row = { id: string; payload?: unknown; [key: string]: unknown };
// All requests are bounded and only fetch material for the selected sections.
async function readRows(table: string, select = 'id,payload', field?: string, values?: string[], skill?: ExamSkill): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = getSupabase().from(table).select(select).order('id');
    if (field && values) query = query.in(field, values);
    if (skill) query = query.eq('payload->>skill', skill);
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw Object.assign(failure(error, 'Unable to load exam content.'), { code: error.code });
    const batch = (data || []) as unknown as Row[];
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}

const paperFields = 'id,book:payload->book,test:payload->test,title:payload->>title,provenance:payload->provenance';
const sectionFields = 'id,paperId:payload->>paperId,skill:payload->>skill,part:payload->part,title:payload->>title,questionTypes:payload->questionTypes,questionCount:payload->questionCount,assetId:payload->>assetId,status:payload->>status,provenance:payload->provenance';
const payload = <T,>(rows: Row[]): T[] => rows.map(row => (row.payload ?? row) as T);

export function loadExamCatalog(skill?: ExamSkill, book?: number, options?: ReadOptions): Promise<ExamCatalog> {
  return cachedRead(examCatalogKey(skill, book), () => readExamCatalog(skill, book), options);
}

async function readExamCatalog(skill?: ExamSkill, book?: number): Promise<ExamCatalog> {
  let catalog = emptyCatalog();
  if (supabaseConfigured()) {
    try {
      const paperRows = await readRows('exam_papers', paperFields, book === undefined ? undefined : 'payload->>book', book === undefined ? undefined : [String(book)]);
      catalog.papers = payload<ExamPaper>(paperRows);
      if (!catalog.papers.length) return catalog;
      catalog.sections = payload<ExamSection>(await readRows('exam_sections', sectionFields, 'payload->>paperId', catalog.papers.map(paper => paper.id), skill))
        .map(section => ({ ...section, sentences: [] }));
      return catalog;
    } catch (error) {
      if (!missingRelation(error as Error)) throw error;
    }
  }
  catalog = await localCatalog('exam-catalog.json', true);
  catalog.papers = catalog.papers.filter(paper => book === undefined || paper.book === book);
  const ids = new Set(catalog.papers.map(paper => paper.id));
  catalog.sections = catalog.sections.filter(section => ids.has(section.paperId) && (!skill || section.skill === skill)).map(section => ({ ...section, sentences: [] }));
  return { ...catalog, passages: [], questions: [], assets: [] };
}

export function loadExamSections(sectionIds: string[], options?: ReadOptions): Promise<ExamCatalog> {
  const ids = selectedIds(sectionIds);
  return cachedRead(examSectionsKey(ids), () => readExamSections(ids), options);
}

async function readExamSections(ids: string[]): Promise<ExamCatalog> {
  if (!ids.length) return emptyCatalog();
  if (supabaseConfigured()) {
    try {
      const catalog = emptyCatalog();
      catalog.sections = payload(await readRows('exam_sections', 'id,payload', 'id', ids));
      if (catalog.sections.length !== ids.length) throw new Error('Some selected sections are unavailable. Refresh the catalog and retry.');
      const paperIds = [...new Set(catalog.sections.map(section => section.paperId))];
      const [papers, passages, questions, assets] = await Promise.all([
        readRows('exam_papers', 'id,payload', 'id', paperIds), readRows('exam_passages', 'id,payload', 'payload->>sectionId', ids),
        readRows('exam_questions', 'id,payload', 'payload->>sectionId', ids), readRows('exam_assets', 'id,payload', 'payload->>paperId', paperIds),
      ]);
      catalog.papers = payload(papers); catalog.passages = payload(passages); catalog.questions = payload(questions);
      const assetIds = new Set([...catalog.sections.map(section => section.assetId), ...catalog.questions.map(question => question.assetId), ...catalog.sections.flatMap(section => section.sentences.map(sentence => sentence.assetId))].filter(Boolean));
      catalog.assets = payload<ExamAsset>(assets).filter(asset => !asset.sectionId || ids.includes(asset.sectionId) || assetIds.has(asset.id));
      return catalog;
    } catch (error) {
      if (!missingRelation(error as Error)) throw error;
    }
  }
  const parts = await Promise.all(ids.map(id => localCatalog(`exam-sections/${encodeURIComponent(id)}.json`)));
  const result = emptyCatalog();
  for (const key of ['papers', 'sections', 'passages', 'questions', 'assets'] as const) {
    const unique = new Map<string, unknown>();
    parts.forEach(part => part[key].forEach(row => unique.set(row.id, row)));
    (result[key] as unknown[]) = [...unique.values()];
  }
  // Offline sample files must identify themselves explicitly as original demos.
  if (!import.meta.env.DEV && result.papers.some(paper => !/original demo/i.test(paper.title))) throw new Error('Local practice material must be identified as an original demo.');
  result.sections = result.sections.filter(section => ids.includes(section.id));
  result.questions = result.questions.filter(question => ids.includes(question.sectionId));
  result.passages = result.passages.filter(passage => ids.includes(passage.sectionId));
  return result;
}

export function resolveExamAsset(asset: ExamAsset, options?: ReadOptions): Promise<string> {
  return cachedRead(examAssetKey(asset), () => readExamAsset(asset), { ...options, ttlMs: EXAM_ASSET_REFRESH_MS, staleWhileRevalidate: false });
}

async function readExamAsset(asset: ExamAsset): Promise<string> {
  if (import.meta.env.DEV && asset.storagePath && !asset.storagePath.startsWith('demo/') && !asset.storagePath.startsWith('data/demo/')) return `${import.meta.env.BASE_URL}exam-assets/${asset.storagePath.split('/').map(encodeURIComponent).join('/')}`;
  if (!supabaseConfigured()) {
    if (asset.storagePath.startsWith('demo/') || asset.storagePath.startsWith('data/demo/')) return `${import.meta.env.BASE_URL}${asset.storagePath}`;
    throw new Error('Sign in to load this exam asset.');
  }
  if (!asset.storagePath) throw new Error('This exam asset is unavailable.');
  const { data, error } = await getSupabase().storage.from('exam-assets').createSignedUrl(asset.storagePath, 3600);
  if (error || !data?.signedUrl) throw failure(error || {}, 'Unable to load the exam asset. Please retry.');
  return data.signedUrl;
}
