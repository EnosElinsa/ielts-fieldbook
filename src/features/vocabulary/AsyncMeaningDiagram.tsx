import { useEffect, useState } from 'react';
import type { VocabularySenseDiagram } from '../../domain/vocabulary/media';
import { vocabularyDiagramLoader } from './diagramLoader';
import '../../styles/vocabulary-visual.css';

type Renderer = NonNullable<ReturnType<typeof vocabularyDiagramLoader.peek>>;
type LoadState = { status: 'loading' | 'failed' } | { status: 'ready'; Renderer: Renderer };

export function AsyncMeaningDiagram({ diagram }: { diagram: VocabularySenseDiagram }) {
  const [state, setState] = useState<LoadState>(() => {
    const Renderer = vocabularyDiagramLoader.peek();
    return Renderer ? { status: 'ready', Renderer } : { status: 'loading' };
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const Renderer = vocabularyDiagramLoader.peek();
    if (Renderer) { setState({ status: 'ready', Renderer }); return; }
    let active = true;
    setState({ status: 'loading' });
    vocabularyDiagramLoader.load().then(
      Renderer => { if (active) setState({ status: 'ready', Renderer }); },
      () => { if (active) setState({ status: 'failed' }); },
    );
    return () => { active = false; };
  }, [attempt]);
  if (state.status === 'ready') return <state.Renderer diagram={diagram} />;
  return <figure className="vocabulary-learning-visual">
    <div className="vocabulary-diagram-placeholder" aria-busy={state.status === 'loading'}>
      {state.status === 'loading' ? <p role="status">Loading diagram…</p> : <div>
        <p role="status">Diagram could not load. You can keep learning from the definition and example.</p>
        <button type="button" className="btn line" onClick={() => setAttempt(value => value + 1)}>Retry diagram</button>
      </div>}
    </div>
    <figcaption>Illustrative diagram · {diagram.term}</figcaption>
  </figure>;
}
