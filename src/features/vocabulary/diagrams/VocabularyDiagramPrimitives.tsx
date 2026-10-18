import type { ReactNode } from 'react';
import type { VocabularySenseDiagram } from '../../../domain/vocabulary/media';
import '../../../styles/vocabulary-visual.css';

export const blue = '#78a9c4', green = '#83ad91', gold = '#cfac6d';
export function Label({ x, y, children, small = false }: { x: number; y: number; children: ReactNode; small?: boolean }) {
  return <text x={x} y={y} textAnchor="middle" className={small ? 'meaning-diagram-small' : 'meaning-diagram-label'}>{children}</text>;
}

export function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const angle = Math.atan2(y2-y1, x2-x1), length = 12;
  return <g className="meaning-diagram-line"><path d={`M${x1} ${y1}L${x2} ${y2}`} /><path d={`M${x2-length*Math.cos(angle-.5)} ${y2-length*Math.sin(angle-.5)}L${x2} ${y2}L${x2-length*Math.cos(angle+.5)} ${y2-length*Math.sin(angle+.5)}`} /></g>;
}

export function Box({ x, y, width = 160, label, sub, color = blue }: { x: number; y: number; width?: number; label: string; sub?: string; color?: string }) {
  return <g><rect x={x} y={y} width={width} height="78" rx="13" fill={color} fillOpacity=".2" stroke={color} strokeWidth="2" /><Label x={x+width/2} y={y+(sub?33:46)}>{label}</Label>{sub ? <Label x={x+width/2} y={y+58} small>{sub}</Label> : null}</g>;
}

export function Building({ x = 190, y = 95, label = 'BANK' }: { x?: number; y?: number; label?: string }) {
  return <g><path d={`M${x} ${y+42}L${x+70} ${y}L${x+140} ${y+42}Z`} fill={gold} /><path d={`M${x+8} ${y+48}H${x+132}V${y+146}H${x+8}Z`} fill={blue} fillOpacity=".25" stroke={blue} strokeWidth="3" />{[28,64,100].map(offset=><rect key={offset} x={x+offset} y={y+72} width="14" height="64" rx="3" fill={blue} />)}<Label x={x+70} y={y+66} small>{label}</Label></g>;
}

export function VocabularyDiagramFrame({ diagram, description, children }: { diagram: VocabularySenseDiagram; description: [string, string]; children: ReactNode }) {
  return <figure className="vocabulary-learning-visual">
    <svg viewBox="0 0 520 350" role="img" aria-label={`${diagram.term}: ${description[0]}`}>
      <rect className="visual-scene-background" x="1" y="1" width="518" height="348" rx="16" />
      {children}
    </svg>
    <figcaption>Illustrative diagram · {description[1]}</figcaption>
  </figure>;
}

/** Eager with the placeholder, so optional packs reuse already loaded SVG primitives. */
export function VocabularyDiagramPlaceholder({ term, loading, onRetry }: { term: string; loading: boolean; onRetry: () => void }) {
  return <figure className="vocabulary-learning-visual">
    <div className="vocabulary-diagram-placeholder" aria-busy={loading}>
      {loading ? <p role="status">Loading diagram…</p> : <div>
        <p role="status">Diagram could not load. You can keep learning from the definition and example.</p>
        <button type="button" className="btn line" onClick={onRetry}>Retry diagram</button>
      </div>}
    </div>
    <figcaption>Illustrative diagram · {term}</figcaption>
  </figure>;
}
