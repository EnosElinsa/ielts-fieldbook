import { useEffect, useRef, useState } from 'react';
import { examAssetKey, examCatalogKey, examSectionsKey, EXAM_ASSET_REFRESH_MS, loadExamCatalog, loadExamSections, resolveExamAsset } from '../../storage/examCatalog';
import { ReadCacheInvalidatedError, readSnapshot, subscribeRead } from '../../lib/readCache';
import type { ExamAsset, ExamCatalog, ExamSkill } from '../../domain/exam/types';

export const EMPTY_EXAM_CATALOG: ExamCatalog = { schemaVersion: 1, papers: [], sections: [], passages: [], questions: [], assets: [] };
export function useExamCatalog(skill: ExamSkill, book?: number, sectionIds?: string[]) {
  const key = sectionIds ? examSectionsKey(sectionIds) : examCatalogKey(skill, book);
  const [state, setState] = useState(() => ({ key, ...readSnapshot<ExamCatalog>(key) }));
  const [revision, setRevision] = useState(0);
  const previousRevision = useRef(revision);
  useEffect(() => {
    let alive = true;
    const force = previousRevision.current !== revision;
    previousRevision.current = revision;
    const update = () => { if (alive) setState({ key, ...readSnapshot<ExamCatalog>(key) }); };
    const unsubscribe = subscribeRead(key, update);
    update();
    const request = sectionIds ? loadExamSections(sectionIds, { force }) : loadExamCatalog(skill, book, { force });
    Promise.resolve(request).then(data => {
      if (alive) setState({ key, ...readSnapshot<ExamCatalog>(key), data });
    }).catch(error => { if (alive && !(error instanceof ReadCacheInvalidatedError)) setState(current => ({ ...current, key, error, loading: false })); });
    return () => { alive = false; unsubscribe(); };
  }, [key, revision]);
  const current = state.key === key ? state : readSnapshot<ExamCatalog>(key);
  return { catalog: current.data ?? EMPTY_EXAM_CATALOG, loading: !current.data && !current.error, error: current.error instanceof Error ? current.error.message : current.error ? 'The catalog could not be loaded.' : '', reload: () => setRevision(value => value + 1) };
}
export function useExamAsset(asset?: ExamAsset) {
  const key = asset ? examAssetKey(asset) : '';
  const cachedUrl = () => {
    const snapshot = readSnapshot<string>(key);
    return key && snapshot.updatedAt !== undefined && Date.now() - snapshot.updatedAt < EXAM_ASSET_REFRESH_MS ? snapshot.data ?? '' : '';
  };
  const [urlState, setUrlState] = useState(() => ({ key, url: cachedUrl() }));
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const previousRevision = useRef(revision);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const force = previousRevision.current !== revision;
    previousRevision.current = revision;
    setUrlState({ key, url: cachedUrl() }); setError('');
    const load = (refresh: boolean) => {
      if (!asset) return;
      Promise.resolve(resolveExamAsset(asset, { force: refresh })).then(value => {
        if (!alive) return;
        setUrlState({ key, url: value }); setError('');
        const updatedAt = readSnapshot<string>(key).updatedAt ?? Date.now();
        timer = setTimeout(() => load(true), Math.max(1, updatedAt + EXAM_ASSET_REFRESH_MS - Date.now()));
      }).catch(problem => { if (alive && !(problem instanceof ReadCacheInvalidatedError)) { setUrlState({ key, url: '' }); setError('This source asset is unavailable.'); } });
    };
    load(force);
    return () => { alive = false; clearTimeout(timer); };
  }, [key, revision]);
  return { url: urlState.key === key ? urlState.url : cachedUrl(), error, reload: () => setRevision(value => value + 1) };
}
export const QUESTION_TYPE_NAMES = { gap: 'Gap completion', single: 'Multiple choice', multiple: 'Choose multiple', 'true-false': 'True / False / Not Given', 'yes-no': 'Yes / No / Not Given', matching: 'Matching', heading: 'Matching headings', map: 'Map / diagram labels', flow: 'Flow-chart completion', summary: 'Summary completion' };
export function examClock(seconds: number) { const safe = Math.max(0, Math.floor(seconds)); return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`; }
