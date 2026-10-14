import { useEffect, useRef, type ReactNode } from 'react';

// Anchor navigation must clear the actual sticky player, including wrapped
// controls, loading notices, browser zoom and user font sizes.
export function IntensivePlayerPanel({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = panel.current!;
    const main = node.parentElement!;
    const measure = () => {
      const sticky = getComputedStyle(node).position === 'sticky';
      main.style.setProperty('--intensive-player-offset', `${sticky ? Math.ceil(node.getBoundingClientRect().height) + 16 : 16}px`);
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    node.addEventListener('toggle', measure, true);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer?.disconnect();
      node.removeEventListener('toggle', measure, true);
      window.removeEventListener('resize', measure);
      main.style.removeProperty('--intensive-player-offset');
    };
  }, []);
  return <div ref={panel} id="intensive-player" className="panel intensive-player-panel">{children}</div>;
}
