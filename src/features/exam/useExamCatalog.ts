import { useEffect, useState } from 'react';
import { loadExamCatalog, loadExamSections, resolveExamAsset } from '../../storage/examCatalog';
import type { ExamAsset, ExamCatalog, ExamSkill } from '../../domain/exam/types';

export const EMPTY_EXAM_CATALOG: ExamCatalog = { schemaVersion: 1, papers: [], sections: [], passages: [], questions: [], assets: [] };
export function useExamCatalog(skill: ExamSkill, book?: number, sectionIds?: string[]) {
  const [catalog, setCatalog] = useState<ExamCatalog>(EMPTY_EXAM_CATALOG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const ids = sectionIds?.join('|');
  useEffect(() => {
    let alive = true; setLoading(true); setError('');
    const request = sectionIds ? loadExamSections(sectionIds) : loadExamCatalog(skill, book);
    Promise.resolve(request).then(data => { if (alive) setCatalog(data); }).catch(problem => { if (alive) { setCatalog(EMPTY_EXAM_CATALOG); setError(problem instanceof Error ? problem.message : 'The catalog could not be loaded.'); } }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [skill, book, ids, revision]);
  return { catalog, loading, error, reload: () => setRevision(value => value + 1) };
}
export function useExamAsset(asset?: ExamAsset) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true; setUrl(''); setError('');
    if (asset) Promise.resolve(resolveExamAsset(asset)).then(value => { if (alive) setUrl(value); }).catch(() => { if (alive) setError('This source asset is unavailable.'); });
    return () => { alive = false; };
  }, [asset?.id, asset?.storagePath, revision]);
  return { url, error, reload: () => setRevision(value => value + 1) };
}
export const QUESTION_TYPE_NAMES = { gap: 'Gap completion', single: 'Multiple choice', multiple: 'Choose multiple', 'true-false': 'True / False / Not Given', 'yes-no': 'Yes / No / Not Given', matching: 'Matching', heading: 'Matching headings', map: 'Map / diagram labels', flow: 'Flow-chart completion', summary: 'Summary completion' };
export function examClock(seconds: number) { const safe = Math.max(0, Math.floor(seconds)); return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`; }
