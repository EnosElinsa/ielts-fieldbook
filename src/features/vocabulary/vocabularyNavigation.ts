import { useContext, useEffect, useState, useRef, useMemo } from "react";
import { WorkspaceScrollRestoration } from '../../components/WorkspaceScrollRestoration';
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { normalizeVocabularyRoute, normalizeVocabularyScope } from '../../domain/vocabulary/identities';
import { migrateVocabularyRecovery } from '../../storage/vocabularyRecovery';
import { accountId } from "../../storage/remote";
import { VOCABULARY_CATALOG } from "../../domain/vocabulary/catalog";
import type { ReleasedVocabularyOptions } from '../../storage/vocabularyCatalog';
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
    ? normalizeVocabularyRoute(value)
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
  Object.entries(normalizeVocabularyScope(request)).forEach(([key, value]) => {
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
  Object.entries({ ...normalizeVocabularyScope(request), senseId, mode }).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `/vocabulary/review?${params}`;
}
const positions = new Map<
  string,
  {
    scroll: number;
    focus: string;
    chapters?: {id: string; open: boolean}[];
  }
>();
const positionKey = (origin: string) =>
  `fieldbook:vocabulary-position:${accountId()}:${normalizeVocabularyRoute(origin)}`;

export function useVocabularySearchParams(): ReturnType<typeof useSearchParams> {
  const [params, setParams] = useSearchParams();
  const normalized = useMemo(() => new URLSearchParams(normalizeVocabularyRoute(`/vocabulary?${params}`).split('?')[1] || ''), [params]);
  return [normalized, setParams];
}
export function rememberVocabularyPosition(origin: string, focus: string) {
  const chapters = Array.from(document.querySelectorAll<HTMLDetailsElement>('details.vocabulary-study-chapter[id]')).map(node=>({id:node.id,open:node.open}));
  const value = { scroll: window.scrollY, focus, chapters };
  positions.set(positionKey(origin), value);
  try {
    sessionStorage.setItem(positionKey(origin), JSON.stringify(value));
  } catch {}
}
export function useVocabularyPosition(origin: string, ready: boolean) {
  const location = useLocation();
  const workspaceScroll = useContext(WorkspaceScrollRestoration);
  const navigationType = useNavigationType();
  const prior = useRef(origin);
  const owner = accountId();
  useEffect(() => {
    if (!ready) return;
    migrateVocabularyRecovery(owner);
    let value = positions.get(positionKey(origin));
    try {
      value ||= JSON.parse(
        sessionStorage.getItem(positionKey(origin)) || "null",
      );
    } catch {}
    const frame = requestAnimationFrame(() => {
      const restoredByWorkspace = workspaceScroll?.current.key === location.key && workspaceScroll.current.restored;
      let layoutChanged = false;
      if (value && (navigationType === 'POP' || location.state?.vocabularyRestore)) {
        value.chapters?.forEach(chapter=>{
          const node = document.getElementById(chapter.id);
          if (node instanceof HTMLDetailsElement && node.open !== chapter.open) { node.open = chapter.open; layoutChanged = true; }
        });
        if (!restoredByWorkspace) window.scrollTo?.(0, value.scroll);
        document.getElementById(value.focus)?.focus({ preventScroll: true });
      } else if (!restoredByWorkspace && (prior.current.split('?')[0] !== origin.split('?')[0] || navigationType === 'PUSH')) {
        window.scrollTo?.(0, 0);
      }
      if (location.hash) try {
        const node = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        let parent = node?.parentElement;
        while (parent) { if (parent instanceof HTMLDetailsElement && !parent.open) { parent.open = true; layoutChanged = true; } parent = parent.parentElement; }
        if (!value && !restoredByWorkspace) node?.scrollIntoView?.();
      } catch {}
      if (restoredByWorkspace && layoutChanged) workspaceScroll.current.restoreAfterLayout?.();
      prior.current = origin;
    });
    const key = positionKey(origin);
    const rememberScroll = () => {
      const saved = positions.get(key);
      positions.set(key, {...saved, scroll: window.scrollY, focus: saved?.focus || ''});
    };
    window.addEventListener('scroll', rememberScroll, {passive: true});
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', rememberScroll);
      const latest = positions.get(key);
      if (latest) try { sessionStorage.setItem(key, JSON.stringify(latest)); } catch {}
    };
  }, [origin, ready, owner, navigationType, location.state, location.hash, location.key, workspaceScroll]);
}
export function useVocabularyCatalog(
  load: ((bookId?: string, options?: ReleasedVocabularyOptions) => Promise<unknown>) | undefined,
  bookId?: string,
  unitId?: string,
  entryId?: string,
) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus("loading");
    const options = unitId || entryId || revision ? { ...(unitId ? { unitId } : {}), ...(entryId ? { entryIds: [entryId] } : {}), ...(revision ? { force: true } : {}) } : undefined;
    Promise.resolve(options ? load?.(bookId, options) : load?.(bookId))
      .then((result) => {
        if (active) setStatus(result === false ? "error" : "ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [load, bookId, unitId, entryId, revision]);
  return { status, retry: () => setRevision((value) => value + 1) };
}
