import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useInRouterContext, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { accountId } from '../storage/remote';

export const workspacePageStateKey = (owner: string | null, key: string) => `fieldbook:page-state:v1:${JSON.stringify(owner)}:${key}`;

function matchesShape(value: unknown, initial: unknown): boolean {
  if (initial === null) return value === null;
  if (typeof initial === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (Array.isArray(initial)) return Array.isArray(value);
  if (typeof initial === 'object') return Boolean(value && typeof value === 'object' && !Array.isArray(value)) && Object.entries(initial as object).every(([key, sample]) => matchesShape((value as Record<string, unknown>)[key], sample));
  return typeof value === typeof initial;
}

export function readWorkspacePageState<T>(owner: string | null, key: string, initial: T, valid?: (value: unknown) => value is T): T {
  try {
    const row = JSON.parse(sessionStorage.getItem(workspacePageStateKey(owner, key)) || 'null');
    if (row?.version === 1 && row.owner === owner && (valid ? valid(row.value) : matchesShape(row.value, initial))) return row.value;
  } catch { /* Browser-only UI recovery is optional. */ }
  return initial;
}

export function writeWorkspacePageState<T>(owner: string | null, key: string, value: T) {
  try { sessionStorage.setItem(workspacePageStateKey(owner, key), JSON.stringify({version: 1, owner, value})); } catch { /* Keep interactive UI when browser storage is blocked. */ }
}

/** UI choices only: drafts and attempts continue to use their existing stores. */
export function useWorkspacePageState<T>(key: string, initial: T | (() => T), valid?: (value: unknown) => value is T): [T, Dispatch<SetStateAction<T>>] {
  const owner = accountId();
  const storageKey = workspacePageStateKey(owner, key);
  const load = () => readWorkspacePageState(owner, key, typeof initial === 'function' ? (initial as () => T)() : initial, valid);
  const [record, setRecord] = useState(() => ({key: storageKey, value: load()}));
  const value = record.key === storageKey ? record.value : load();
  useEffect(() => { if (record.key !== storageKey) setRecord({key: storageKey, value}); }, [storageKey, record.key, value]);
  const setValue: Dispatch<SetStateAction<T>> = next => {
    if (accountId() !== owner) return;
    setRecord(previous => {
      const before = previous.key === storageKey ? previous.value : load();
      const updated = typeof next === 'function' ? (next as (before: T) => T)(before) : next;
      writeWorkspacePageState(owner, key, updated);
      return {key: storageKey, value: updated};
    });
  };
  return [value, setValue];
}

export type WorkspaceDeskContext = { skill: 'writing' | 'speaking'; id: string; mode: string; part?: string; questionIndex?: number };
const deskModes = new Set(['full', 'timed', 'overview', 'outline', 'compare', 'body', 'speak-blind', 'speak-notes', 'speak-full', 'speaking']);

/** Capture the selected desk in the actual history entry so explicit new destinations stay explicit. */
export function useWorkspaceDeskContext(context: WorkspaceDeskContext, restore: (saved: WorkspaceDeskContext) => void, exists: (id: string) => boolean, ready = true) {
  // Standalone desk previews/tests have no router; the real workspace always has one.
  const inRouter = useInRouterContext();
  const location = inRouter ? useLocation() : null;
  const navigate = inRouter ? useNavigate() : null;
  const navigationType = inRouter ? useNavigationType() : null;
  const owner = accountId();
  const restored = useRef<{owner: string | null; key: string} | null>(null);
  const serialized = JSON.stringify(context);
  useEffect(() => {
    if (!ready || !location || !navigate) return;
    const saved = location.state?.workspaceDeskContext;
    if (restored.current?.owner !== owner || restored.current.key !== location.key) {
      restored.current = {owner, key: location.key};
      // Our own history-state replacement must not undo a newly selected question.
      const canRestore = navigationType === 'POP' || navigationType === 'PUSH' && location.state?.workspaceModuleRestore?.owner === owner;
      if (canRestore && saved?.owner === owner && saved.skill === context.skill && typeof saved.id === 'string' && deskModes.has(saved.mode) && exists(saved.id)) {
        if (JSON.stringify({...saved, owner: undefined}) !== serialized) { restore(saved); return; }
      }
    }
    const next = {...context, owner};
    if (JSON.stringify(saved) === JSON.stringify(next)) return;
    navigate(location.pathname + location.search + location.hash, {replace: true, state: {...location.state, workspaceDeskContext: next}});
  }, [serialized, owner, location?.key, location?.state, navigationType, ready]);
}
