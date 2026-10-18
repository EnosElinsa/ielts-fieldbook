import { isPageDownloadError, loadOptionalPageModule } from '../../lib/pageLoadRecovery';
import { getVocabularyDiagramPack } from './diagramPacks';
import type { VocabularyDiagramModule, VocabularyDiagramPack, VocabularyDiagramRenderer } from './diagramTypes';

function failedDiagramUrl(error: unknown, moduleName: string): string | undefined {
  if (!isPageDownloadError(error)) return;
  const message = String((error as Error).message);
  for (const candidate of message.match(/https?:\/\/[^\s"'<>]+/g) || []) {
    try {
      const url = new URL(candidate);
      const filename = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
      if (url.origin === window.location.origin && /^[A-Za-z]\w*$/.test(moduleName) &&
          (filename === `${moduleName}.tsx` || new RegExp(`^${moduleName}-[\\w-]+\\.js$`).test(filename))) return url.href;
    } catch { /* An error message need not contain a usable URL. */ }
  }
}

export function createVocabularyDiagramLoader(
  resolvePack: (kind: string) => VocabularyDiagramPack | undefined,
  retryModule: (url: string) => Promise<VocabularyDiagramModule> = url => import(/* @vite-ignore */ url),
) {
  const cache = new Map<string, { loaded?: VocabularyDiagramRenderer; pending?: Promise<VocabularyDiagramRenderer>; failedUrl?: string; retries: number }>();
  return {
    keyFor: (kind: string) => resolvePack(kind)?.id,
    peek: (kind: string) => {
      const pack = resolvePack(kind);
      return pack ? cache.get(pack.id)?.loaded : undefined;
    },
    load: (kind: string): Promise<VocabularyDiagramRenderer> => {
      const pack = resolvePack(kind);
      if (!pack) return Promise.reject(new Error('Diagram unavailable for this meaning.'));
      const state = cache.get(pack.id) || { retries: 0 };
      cache.set(pack.id, state);
      if (state.loaded) return Promise.resolve(state.loaded);
      if (!state.pending) {
        // Browsers cache a rejected native import; retry the same asset with a fresh URL.
        const retryUrl = state.failedUrl ? new URL(state.failedUrl) : undefined;
        if (retryUrl) retryUrl.searchParams.set('diagramRetry', String(++state.retries));
        const load = retryUrl ? () => retryModule(retryUrl.href) : pack.load;
        state.pending = loadOptionalPageModule(pack.moduleName, load).then(module => {
          state.loaded = module.VocabularyMeaningDiagram;
          return state.loaded;
        }).catch(error => {
          state.failedUrl = failedDiagramUrl(error, pack.moduleName) || state.failedUrl;
          state.pending = undefined;
          throw error;
        });
      }
      return state.pending;
    },
  };
}

export const vocabularyDiagramLoader = createVocabularyDiagramLoader(getVocabularyDiagramPack);
