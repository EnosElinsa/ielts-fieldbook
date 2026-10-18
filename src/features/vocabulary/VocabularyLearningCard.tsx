import { useLayoutEffect, useRef, type ReactNode } from 'react';

const timing = { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };

/** Keep one live card so navigation never waits for motion or retains old audio. */
export function VocabularyLearningCard({ cardKey, position, children }: { cardKey: string; position: number; children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const previous = useRef({ cardKey, position });
  const lastHeight = useRef(0);
  const reveal = useRef<Animation | undefined>(undefined);
  const resize = useRef<Animation | undefined>(undefined);
  const reduced = useRef<MediaQueryList | null>(null);
  const measure = useRef(() => {});

  useLayoutEffect(() => {
    const container = frame.current, content = card.current;
    if (!container || !content) return;
    reduced.current = window.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
    const stop = () => { reveal.current?.cancel(); resize.current?.cancel(); reveal.current = undefined; resize.current = undefined; };
    measure.current = () => {
      const target = content.offsetHeight;
      const from = resize.current?.playState === 'running' ? container.getBoundingClientRect().height : lastHeight.current;
      resize.current?.cancel();
      resize.current = undefined;
      lastHeight.current = target;
      if (from && target && Math.abs(from - target) > 1 && !reduced.current?.matches && typeof container.animate === 'function') {
        resize.current = container.animate([{ height: `${from}px`, overflow: 'clip' }, { height: `${target}px`, overflow: 'clip' }], timing);
      }
    };
    measure.current();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      // Ignore notifications for the height already handled by this commit.
      if (content.offsetHeight !== lastHeight.current) measure.current();
    }) : undefined;
    observer?.observe(content);
    reduced.current?.addEventListener('change', stop);
    return () => { observer?.disconnect(); reduced.current?.removeEventListener('change', stop); stop(); measure.current = () => {}; };
  }, []);

  useLayoutEffect(() => {
    const last = previous.current;
    previous.current = { cardKey, position };
    measure.current();
    if (last.cardKey === cardKey) return;
    reveal.current?.cancel();
    const content = card.current;
    if (!content || reduced.current?.matches || typeof content.animate !== 'function') return;
    const direction = position < last.position ? -1 : 1;
    reveal.current = content.animate([
      { opacity: 0.25, transform: `translateX(${direction * 16}px)` },
      { opacity: 1, transform: 'none' },
    ], timing);
  }, [cardKey, position]);

  return <div className="vocabulary-learning-card-frame" ref={frame}><article className="vocabulary-learning-card" aria-label="Current learning word" ref={card}>{children}</article></div>;
}
