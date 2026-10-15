import type { ExamSkill } from './types';

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'] as const;
export type HighlightColor = typeof HIGHLIGHT_COLORS[number];
export type TextAnchor = { blockId: string; quote: string; prefix: string; suffix: string; start: number; end: number; contentVersion: string };
export type ExamAnnotation = { id: string; skill: ExamSkill; sourceId: string; color: HighlightColor; highlighted?: boolean; quote: string; note: string; anchors: TextAnchor[]; updatedAt: string };

export function makeTextAnchor(blockId: string, text: string, start: number, end: number, contentVersion: string): TextAnchor {
  const from = Math.max(0, Math.min(text.length, start));
  const to = Math.max(from, Math.min(text.length, end));
  return { blockId, quote: text.slice(from, to), prefix: text.slice(Math.max(0, from - 40), from), suffix: text.slice(to, to + 40), start: from, end: to, contentVersion };
}

export function resolveTextAnchor(anchor: TextAnchor, text: string, version: string): { start: number; end: number } | null {
  if (!anchor.quote) return null;
  const matches: number[] = [];
  for (let at = text.indexOf(anchor.quote); at >= 0; at = text.indexOf(anchor.quote, at + 1)) matches.push(at);
  const contextual = matches.filter(at => (!anchor.prefix || text.slice(0, at).endsWith(anchor.prefix)) && (!anchor.suffix || text.slice(at + anchor.quote.length).startsWith(anchor.suffix)));
  if (contextual.length === 1) return { start: contextual[0], end: contextual[0] + anchor.quote.length };
  if (version === anchor.contentVersion && contextual.includes(anchor.start) && text.slice(anchor.start, anchor.end) === anchor.quote) return { start: anchor.start, end: anchor.end };
  if (matches.length === 1) return { start: matches[0], end: matches[0] + anchor.quote.length };
  return null;
}

export function annotationSegments(blockId: string, text: string, version: string, annotations: ExamAnnotation[]) {
  const ranges = annotations.flatMap(row => row.anchors.filter(anchor => anchor.blockId === blockId).flatMap(anchor => {
    const range = resolveTextAnchor(anchor, text, version);
    return range ? [{ ...range, id: row.id, color: row.highlighted === false ? undefined : row.color }] : [];
  }));
  const points = [...new Set([0, text.length, ...ranges.flatMap(range => [range.start, range.end])])].sort((a, b) => a - b);
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const active = ranges.filter(range => range.start <= start && range.end >= end);
    const highlights = active.filter(range => range.color);
    return { text: text.slice(start, end), start, annotationIds: [...new Set(active.map(range => range.id))], primaryAnnotationId: highlights.at(-1)?.id || active.at(-1)?.id, color: highlights.at(-1)?.color };
  });
}

export function normalizeExamAnnotations(input: unknown): ExamAnnotation[] {
  if (!Array.isArray(input)) return [];
  return input.filter(row => row && typeof row.id === 'string' && typeof row.sourceId === 'string' && ['reading', 'listening'].includes(row.skill) && Array.isArray(row.anchors))
    .map(row => ({ id: row.id, skill: row.skill, sourceId: row.sourceId,
      color: HIGHLIGHT_COLORS.includes(row.color) ? row.color : 'yellow', ...(row.highlighted === false ? { highlighted: false } : {}), quote: String(row.quote || ''), note: String(row.note || ''), updatedAt: String(row.updatedAt || ''),
      anchors: row.anchors.filter((anchor: TextAnchor) => anchor && typeof anchor.blockId === 'string' && typeof anchor.quote === 'string' && anchor.quote && Number.isInteger(anchor.start) && Number.isInteger(anchor.end) && anchor.start >= 0 && anchor.end > anchor.start)
        .map((anchor: TextAnchor) => ({ ...anchor, prefix: String(anchor.prefix || ''), suffix: String(anchor.suffix || ''), contentVersion: String(anchor.contentVersion || '') })),
    })).filter(row => row.anchors.length > 0);
}
