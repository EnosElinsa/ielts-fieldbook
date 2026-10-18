import { useEffect, useState } from 'react';
import type { VocabularySenseDiagram } from '../../domain/vocabulary/media';
import { vocabularyDiagramLoader } from './diagramLoader';
import { VocabularyDiagramPlaceholder } from './diagrams/VocabularyDiagramPrimitives';

type Renderer = NonNullable<ReturnType<typeof vocabularyDiagramLoader.peek>>;
type LoadState = { key: string | undefined } & ({ status: 'loading' | 'failed' } | { status: 'ready'; Renderer: Renderer });

export function AsyncMeaningDiagram({ diagram }: { diagram: VocabularySenseDiagram }) {
  const key = vocabularyDiagramLoader.keyFor(diagram.kind);
  const cached = vocabularyDiagramLoader.peek(diagram.kind);
  const [state, setState] = useState<LoadState>(() => {
    return cached ? { key, status: 'ready', Renderer: cached } : { key, status: 'loading' };
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const Renderer = vocabularyDiagramLoader.peek(diagram.kind);
    if (Renderer) { setState({ key, status: 'ready', Renderer }); return; }
    let active = true;
    setState({ key, status: 'loading' });
    vocabularyDiagramLoader.load(diagram.kind).then(
      Renderer => { if (active) setState({ key, status: 'ready', Renderer }); },
      () => { if (active) setState({ key, status: 'failed' }); },
    );
    return () => { active = false; };
    // Every kind in a pack uses the same renderer; current props stay current.
  }, [key, attempt]);
  const Ready = cached || (state.key === key && state.status === 'ready' ? state.Renderer : undefined);
  if (Ready) return <Ready diagram={diagram} />;
  return <VocabularyDiagramPlaceholder term={diagram.term} loading={state.key !== key || state.status !== 'failed'} onRetry={() => setAttempt(value => value + 1)} />;
}
