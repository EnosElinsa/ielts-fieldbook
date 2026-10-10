import { useEffect, useState } from "react";
import { accountId } from "../../storage/remote";
import { VOCABULARY_CATALOG } from "../../domain/vocabulary/catalog";
import type {
  VocabularyEntry,
  VocabularyStore,
} from "../../domain/vocabulary/types";
export function groupWords(
  state: Partial<VocabularyStore>,
  bookId: string,
  unitId: string,
) {
  const unit = VOCABULARY_CATALOG.units.find(
    (row) => row.bookId === bookId && row.id === unitId,
  );
  const ids = [
    ...new Set([
      ...VOCABULARY_CATALOG.memberships
        .filter((row) => row.bookId === bookId && row.unitId === unitId)
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((row) => row.entryId),
      ...(unit?.entryIds || []),
      ...(state.vocabulary || [])
        .filter((entry) =>
          entry.sources.some(
            (source) => source.bookId === bookId && source.unitId === unitId,
          ),
        )
        .map((entry) => entry.id),
    ]),
  ];
  const entries = new Map(
    [
      ...(VOCABULARY_CATALOG.entries as unknown as VocabularyEntry[]),
      ...(state.vocabulary || []),
    ].map((entry) => [entry.id, entry]),
  );
  return ids.map((id, index) => ({
    entry: entries.get(id),
    index: index + 1,
    id,
  }));
}
export function groupPath(bookId: string, unitId: string) {
  const book = VOCABULARY_CATALOG.books.find((row) => row.id === bookId);
  let unit = VOCABULARY_CATALOG.units.find(
    (row) => row.bookId === bookId && row.id === unitId,
  );
  const names: string[] = [];
  const seen = new Set<string>();
  while (unit && !seen.has(unit.id)) {
    seen.add(unit.id);
    names.unshift(unit.title);
    unit = VOCABULARY_CATALOG.units.find(
      (row) => row.bookId === bookId && row.id === unit?.parentId,
    );
  }
  return [book?.title, ...names].filter(Boolean).join(" / ");
}
export function safeVocabularyReturn(
  value: string | null,
  fallback = "/vocabulary",
) {
  return value &&
    /^\/vocabulary(?:\/[^?#]*)?(?:\?[^#]*)?(?:#[^\s]*)?$/.test(value) &&
    !/[\r\n\\]/.test(value)
    ? value
    : fallback;
}
export function entryUrl(
  entryId: string,
  request: {
    bookId?: string;
    unitId?: string;
    senseId?: string;
  },
  returnTo: string,
) {
  const params = new URLSearchParams({ returnTo });
  Object.entries(request).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `/vocabulary/entry/${encodeURIComponent(entryId)}?${params}`;
}
export function practiceUrl(
  entryId: string,
  senseId: string | undefined,
  request: {
    bookId?: string;
    unitId?: string;
  },
  returnTo: string,
  mode?: string,
) {
  const params = new URLSearchParams({ entryId, dueOnly: "false", returnTo });
  Object.entries({ ...request, senseId, mode }).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `/vocabulary/review?${params}`;
}
const positions = new Map<
  string,
  {
    scroll: number;
    focus: string;
  }
>();
const positionKey = (origin: string) =>
  `fieldbook:vocabulary-position:${accountId()}:${origin}`;
export function rememberVocabularyPosition(origin: string, focus: string) {
  const value = { scroll: window.scrollY, focus };
  positions.set(positionKey(origin), value);
  try {
    sessionStorage.setItem(positionKey(origin), JSON.stringify(value));
  } catch {}
}
export function useVocabularyPosition(origin: string, ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    let value = positions.get(positionKey(origin));
    try {
      value ||= JSON.parse(
        sessionStorage.getItem(positionKey(origin)) || "null",
      );
    } catch {}
    const frame = requestAnimationFrame(() => {
      if (value) {
        window.scrollTo?.(0, value.scroll);
        document.getElementById(value.focus)?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [origin, ready]);
}
export function useVocabularyCatalog(
  load: ((bookId?: string) => Promise<unknown>) | undefined,
  bookId?: string,
) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus("loading");
    Promise.resolve(load?.(bookId))
      .then((result) => {
        if (active) setStatus(result === false ? "error" : "ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [load, bookId, revision]);
  return { status, retry: () => setRevision((value) => value + 1) };
}
