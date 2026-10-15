/** UTF-16 offsets, like DOM Range and persisted source anchors. Keep word-internal punctuation. */
function words(text: string) {
  return [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:(?:['’ʼ\-‐‑\u00ad]|[.,](?=\p{N}))[\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu)];
}

export function snapTextSelection(text: string, start: number, end: number): { start: number; end: number } | null {
  let from = Math.max(0, Math.min(text.length, start));
  let to = Math.max(from, Math.min(text.length, end));
  if (from === to) return null;
  const selected = words(text).filter(word => word.index < to && word.index + word[0].length > from);
  if (!selected.length) return null;
  from = Math.min(from, selected[0].index);
  to = Math.max(to, selected.at(-1)!.index + selected.at(-1)![0].length);
  while (/\s/u.test(text[from] || '') && from < to) from++;
  while (/\s/u.test(text[to - 1] || '') && to > from) to--;
  return { start: from, end: to };
}

export function vocabularySelectionText(quote: string): string {
  const tokens = words(quote);
  return tokens.length ? quote.slice(tokens[0].index, tokens.at(-1)!.index + tokens.at(-1)![0].length).replace(/\s+/gu, ' ').trim() : '';
}
