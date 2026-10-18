import type { VocabularyMeaningDiagram } from './VocabularyMeaningDiagram';
import { isPageDownloadError, loadOptionalPageModule } from '../../lib/pageLoadRecovery';

type Renderer = typeof VocabularyMeaningDiagram;
type DiagramModule = { VocabularyMeaningDiagram: Renderer };

function failedDiagramUrl(error: unknown): string | undefined {
  if (!isPageDownloadError(error)) return;
  const message = String((error as Error).message);
  for (const candidate of message.match(/https?:\/\/[^\s"'<>]+/g) || []) {
    try {
      const url = new URL(candidate);
      if (url.origin === window.location.origin && /\/VocabularyMeaningDiagram(?:-[\w-]+\.js|\.tsx)$/.test(url.pathname)) return url.href;
    } catch { /* An error message need not contain a usable URL. */ }
  }
}

export function createVocabularyDiagramLoader(
  importModule: () => Promise<DiagramModule>,
  retryModule: (url: string) => Promise<DiagramModule> = url => import(/* @vite-ignore */ url),
) {
  let loaded: Renderer | undefined;
  let pending: Promise<Renderer> | undefined;
  let failedUrl: string | undefined;
  let retries = 0;
  return {
    peek: () => loaded,
    load: () => {
      if (loaded) return Promise.resolve(loaded);
      if (!pending) {
        // Browsers cache a rejected native import; retry the same asset with a fresh URL.
        const retryUrl = failedUrl ? new URL(failedUrl) : undefined;
        if (retryUrl) retryUrl.searchParams.set('diagramRetry', String(++retries));
        const load = retryUrl ? () => retryModule(retryUrl.href) : importModule;
        pending = loadOptionalPageModule('VocabularyMeaningDiagram', load).then(module => {
          loaded = module.VocabularyMeaningDiagram;
          return loaded;
        }).catch(error => {
          failedUrl = failedDiagramUrl(error) || failedUrl;
          pending = undefined;
          throw error;
        });
      }
      return pending;
    },
  };
}

export const vocabularyDiagramLoader = createVocabularyDiagramLoader(() => import('./VocabularyMeaningDiagram'));
