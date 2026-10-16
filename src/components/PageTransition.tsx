import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Reveal the resolved page without keeping old forms, timers or audio mounted. */
export function PageTransition({ transitionKey, children }: { transitionKey: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof node.animate !== 'function') return;
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (preference?.matches) return;
    let animation: Animation | undefined;
    let observer: MutationObserver | undefined;
    const reveal = () => {
      if (!node.querySelector('.view.active, .async-state-error, .workspace-page-error') || node.querySelector('.async-loading-page')) return;
      observer?.disconnect();
      animation = node.animate([
        { opacity: 0, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    };
    observer = new MutationObserver(reveal);
    observer.observe(node, { childList: true, subtree: true });
    reveal();
    const stop = () => { animation?.cancel(); observer?.disconnect(); };
    preference?.addEventListener('change', stop);
    return () => { stop(); preference?.removeEventListener('change', stop); };
  }, [transitionKey]);
  return <div className="page" ref={ref}>{children}</div>;
}
