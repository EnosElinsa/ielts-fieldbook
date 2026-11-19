import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import type { WorkspaceScrollState } from './WorkspaceScrollRestoration';

/** Reveal the resolved page without keeping old forms, timers or audio mounted. */
export function PageTransition({ transitionKey, focusKey = transitionKey, skipHeadingFocus = false, scrollRestoration, children }: {
  transitionKey: string; focusKey?: string; skipHeadingFocus?: boolean;
  scrollRestoration?: RefObject<WorkspaceScrollState>; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || skipHeadingFocus) return;
    let frame = 0;
    const observer = new MutationObserver(schedule);
    const stop = () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', stop, true);
      document.removeEventListener('keydown', stop, true);
    };
    const focusHeading = () => {
      frame = 0;
      if (scrollRestoration?.current.restored || document.querySelector('[role="dialog"], dialog[open]')) { stop(); return; }
      if (!node.querySelector('.view.active, .async-state-error, .workspace-page-error') || node.querySelector('.async-loading-page')) return;
      // A task, form autofocus or route-specific restoration has a more precise destination.
      if (node.contains(document.activeElement)) { stop(); return; }
      const heading = (node.closest('main') || node).querySelector<HTMLElement>('h1');
      if (!heading) return;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      stop();
    };
    function schedule() { if (!frame) frame = requestAnimationFrame(focusHeading); }
    observer.observe(node, { childList: true, subtree: true });
    document.addEventListener('pointerdown', stop, true);
    document.addEventListener('keydown', stop, true);
    schedule();
    return stop;
    // Search and filter changes may animate, but must not move the user's focus.
  }, [focusKey]);
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
        { opacity: 0.8 },
        { opacity: 1 },
      ], { duration: 160, easing: 'ease-out' });
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
