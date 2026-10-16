import { canonicalListeningUrl, moduleFor, type WorkspaceModule } from './workspaceNavigation';
import { normalizeVocabularyRoute } from '../domain/vocabulary/identities';

export type ModuleContext = { url: string; state: unknown; scroll: { x: number; y: number } };
type ModuleMemory = { version: 1; owner: string | null; modules: Partial<Record<WorkspaceModule, ModuleContext>> };
export const moduleMemoryKey = (owner: string | null) => `fieldbook:module-memory:v1:${JSON.stringify(owner)}`;
type HistoryPosition = Pick<ModuleContext, 'url' | 'scroll'>;
const historyMemoryKey = (owner: string | null) => `fieldbook:history-scroll:v1:${JSON.stringify(owner)}`;

export function readHistoryScrollMemory(owner: string | null): Map<string, HistoryPosition> {
  try {
    const value = JSON.parse(sessionStorage.getItem(historyMemoryKey(owner)) || 'null');
    if (value?.version === 1 && value.owner === owner && Array.isArray(value.positions)) {
      return new Map(value.positions.slice(-80).filter((entry: unknown): entry is [string, HistoryPosition] => {
        if (!Array.isArray(entry) || typeof entry[0] !== 'string') return false;
        const position = entry[1];
        return typeof position?.url === 'string' && Number.isFinite(position.scroll?.x) && position.scroll.x >= 0 && Number.isFinite(position.scroll?.y) && position.scroll.y >= 0;
      }));
    }
  } catch { /* History still works when storage is unavailable. */ }
  return new Map();
}

export function rememberHistoryScrollMemory(owner: string | null, positions: Map<string, HistoryPosition>) {
  try { sessionStorage.setItem(historyMemoryKey(owner), JSON.stringify({ version: 1, owner, positions: [...positions] })); } catch { /* Session storage is optional. */ }
}

export function safeModuleUrl(value: unknown, module: WorkspaceModule): value is string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\s\\]/.test(value)) return false;
  try {
    const url = new URL(value, 'https://fieldbook.local');
    if (url.origin !== 'https://fieldbook.local' || `${url.pathname}${url.search}${url.hash}` !== value) return false;
    const path = decodeURIComponent(url.pathname);
    if (/[\\\s]/.test(path) || path.split('/').some(segment => segment === '.' || segment === '..')) return false;
    if (moduleFor(url.pathname, url.search, module) !== module) return false;
    // Recognize registered routes, rather than accepting lookalike path prefixes.
    if (module === 'today') return path === '/' || path === '/today';
    if (module === 'planning') return path === '/planning';
    if (module === 'settings') return /^\/settings(?:\/(?:target|schedule|skills|vocabulary|audio|appearance|account|backup))?$/.test(path);
    if (module === 'progress') return path === '/progress';
    if (module === 'writing') return /^\/(?:write(?:\/questions)?|review(?:\/[^/]+)?)$/.test(path);
    if (module === 'speaking') return /^\/(?:speak(?:\/questions|\/topics\/[^/]+)?|stories|review(?:\/[^/]+)?)$/.test(path);
    if (module === 'vocabulary') return /^\/vocabulary(?:\/(?:words|wordbooks(?:\/[^/]+(?:\/groups\/[^/]+\/(?:words|learn))?)?|history(?:\/[^/]+)?|entry\/[^/]+|review|study))?$/.test(path);
    return new RegExp(`^/${module}(?:/[^/]+|/review/[^/]+|/mock/[^/]+${module === 'listening' ? '|/intensive/[^/]+' : ''})?$`).test(path);
  } catch { return false; }
}

function readMemory(owner: string | null): ModuleMemory {
  try {
    const value = JSON.parse(sessionStorage.getItem(moduleMemoryKey(owner)) || 'null');
    if (value?.version === 1 && value.owner === owner && value.modules && typeof value.modules === 'object') return value;
  } catch { /* Session storage is optional. */ }
  return { version: 1, owner, modules: {} };
}

export function readModuleContext(owner: string | null, module: WorkspaceModule): ModuleContext | null {
  const context = readMemory(owner).modules[module];
  if (!context || !safeModuleUrl(context.url, module)) return null;
  const { x, y } = context.scroll || {};
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return null;
  return module === 'listening' ? { ...context, url: canonicalListeningUrl(context.url) } : module === 'vocabulary' ? { ...context, url: normalizeVocabularyRoute(context.url) } : context;
}

export function rememberModuleContext(owner: string | null, module: WorkspaceModule, context: ModuleContext) {
  if (!safeModuleUrl(context.url, module)) return;
  const memory = readMemory(owner);
  memory.modules[module] = module === 'listening' ? { ...context, url: canonicalListeningUrl(context.url) } : module === 'vocabulary' ? { ...context, url: normalizeVocabularyRoute(context.url) } : context;
  try { sessionStorage.setItem(moduleMemoryKey(owner), JSON.stringify(memory)); } catch { /* Navigation still works when storage is full or unavailable. */ }
}

/** History indices belong to the original entry, not the resumed module entry. */
function restoredVocabularyOrigin(value: unknown, owner: string | null, depth = 0): unknown {
  if (!value || typeof value !== 'object' || depth >= 12) return undefined;
  const row = value as { owner?: unknown; url?: unknown; parent?: unknown };
  if (row.owner !== owner || !safeModuleUrl(row.url, 'vocabulary')) return undefined;
  return { owner, url: normalizeVocabularyRoute(row.url), parent: restoredVocabularyOrigin(row.parent, owner, depth + 1) };
}

export function restoredModuleState(context: ModuleContext, owner: string | null, module: WorkspaceModule) {
  if (module !== 'vocabulary' && (!context.state || typeof context.state !== 'object' || Array.isArray(context.state))) return context.state;
  const original = context.state && typeof context.state === 'object' && !Array.isArray(context.state) ? context.state as Record<string, unknown> : {};
  return { ...original, workspaceModuleRestore: { owner, url: context.url }, ...(module === 'vocabulary' ? { vocabularyRestore: true, vocabularyReturn: restoredVocabularyOrigin(original.vocabularyReturn, owner) } : {}) };
}
