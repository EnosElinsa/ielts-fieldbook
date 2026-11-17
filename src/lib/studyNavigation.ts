import type { Location } from 'react-router-dom';

export type StudyReturnOrigin = { owner: string | null; url: string; sourceUrl?: string; index?: number; parent?: StudyReturnOrigin };

/** An overview's tab belongs in its URL, never inferred from a task's new status. */
export function studySourceUrl(location: Pick<Location,'pathname'|'search'|'hash'>, hash = location.hash) {
  const params = new URLSearchParams(location.search);
  if (location.pathname === '/planning' && !['schedule','waiting','history'].includes(params.get('view') || '')) params.set('view','schedule');
  return location.pathname + (params.size ? `?${params}` : '') + hash;
}

/** Pop only to an address proven to be in this account's owned browser history. */
export function studyReturnDelta(origin: StudyReturnOrigin | undefined, to: string, owner: string | null, index: unknown, restored: boolean) {
  if (restored || origin?.owner !== owner || origin.url !== to || origin.sourceUrl && origin.sourceUrl !== to) return;
  if (Number.isInteger(index) && Number.isInteger(origin.index) && origin.index! >= 0 && (index as number) > origin.index!) return origin.index! - (index as number);
}
