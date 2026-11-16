import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

// Anchor navigation must clear the actual sticky player, including wrapped
// controls, loading notices, browser zoom and user font sizes.
export function IntensivePlayerPanel({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const origin = useRef<HTMLDivElement>(null);
  const [docked,setDocked] = useState(false);
  const [expanded,setExpanded] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      const past = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      setDocked(past);
      if (!past) setExpanded(false);
    });
    observer.observe(origin.current!);
    return () => observer.disconnect();
  }, []);
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
  return <><div ref={origin} className="intensive-player-sentinel" aria-hidden="true"/><div ref={panel} id="intensive-player" className="panel intensive-player-panel" data-docked={docked} data-compact={docked&&!expanded}>{children}<button type="button" className="btn line intensive-player-expand" aria-label={expanded?'Collapse audio player':'Expand audio player'} aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?<ChevronUp size={18}/>:<ChevronDown size={18}/>}</button></div></>;
}
