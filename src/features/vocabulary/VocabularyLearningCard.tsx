import { useLayoutEffect, useRef, type ReactNode } from 'react';

const timing = { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };

/** Keep one live card so navigation never waits for motion or retains old audio. */
export function VocabularyLearningCard({ cardKey, position, children }: { cardKey: string; position: number; children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const previous = useRef({ cardKey, position });
  const reveal = useRef<Animation | undefined>(undefined);
  const reduced = useRef<MediaQueryList | null>(null);

  useLayoutEffect(() => {
    reduced.current = window.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
    const stop = () => { reveal.current?.cancel(); reveal.current = undefined; };
    reduced.current?.addEventListener('change', stop);
    return () => { reduced.current?.removeEventListener('change', stop); stop(); };
  }, []);

  useLayoutEffect(() => {
    const last = previous.current;
    previous.current = { cardKey, position };
    if (last.cardKey === cardKey) return;
    frame.current?.scrollTo?.(0, 0);
    reveal.current?.cancel();
    const content = card.current;
    if (!content || reduced.current?.matches || typeof content.animate !== 'function') return;
    const direction = position < last.position ? -1 : 1;
    reveal.current = content.animate([
      { opacity: 0.25, transform: `translateX(${direction * 16}px)` },
      { opacity: 1, transform: 'none' },
    ], timing);
  }, [cardKey, position]);

  return <div className="vocabulary-learning-card-frame" ref={frame} role="region" aria-label="Learning card content" tabIndex={0}><article className="vocabulary-learning-card" aria-label="Current learning word" ref={card}>{children}</article></div>;
}
