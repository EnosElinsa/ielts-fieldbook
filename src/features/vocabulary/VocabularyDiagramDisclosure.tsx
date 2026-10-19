import { useState } from 'react';
import type { VocabularySenseDiagram } from '../../domain/vocabulary/media';
import { AsyncMeaningDiagram } from './AsyncMeaningDiagram';
import '../../styles/vocabulary-visual.css';

export function VocabularyDiagramDisclosure({ diagram, number }: { diagram: VocabularySenseDiagram; number?: number }) {
  return <DiagramDisclosure key={JSON.stringify(diagram)} diagram={diagram} number={number} />;
}

function DiagramDisclosure({ diagram, number }: { diagram: VocabularySenseDiagram; number?: number }) {
  const [open, setOpen] = useState(false);
  return <details className="vocabulary-dictionary-diagram" aria-label={number === undefined ? 'Supplementary diagram' : `Diagram for meaning ${number}`}
    onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>View diagram</summary>
    {open ? <AsyncMeaningDiagram diagram={diagram} /> : null}
  </details>;
}
