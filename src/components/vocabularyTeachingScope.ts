/** Exact routes prepare one word; evidence-scoped setup prepares teaching in its controller. */
export function vocabularyTeachingScope(pathname: string, search: string): string[] | undefined {
  const validId = (id: string) => id.length > 0 && id.length <= 512 && id === id.trim() && !/[\/\\\u0000-\u001f\u007f\ufffd]/.test(id);
  const details = /^\/vocabulary\/entry\/([^/]+)\/?$/.exec(pathname);
  if (details) {
    try {
      const id = decodeURIComponent(details[1]);
      return validId(id) ? [id] : undefined;
    } catch { return undefined; }
  }
  // Study builds a unit queue even when a copied URL includes entryId.
  if (pathname !== '/vocabulary/review') return undefined;
  const params = new URLSearchParams(search);
  if (['batch', 'batchCards', 'planId', 'resume', 'sessionId'].some(key => params.has(key))) return undefined;
  const ids = params.getAll('entryId');
  if(!ids.length&&(params.get('dueOnly')!=='false'||params.get('wrongOnly')==='true'))return [];
  if(params.get('scheduledOnly')==='true')return undefined;
  return ids.length === 1 && validId(ids[0]) ? ids : undefined;
}
