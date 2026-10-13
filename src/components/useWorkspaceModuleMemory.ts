import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { navigateWithPracticeGuard } from '../lib/practiceNavigation';
import { moduleFor, workspaceModules, type WorkspaceModule } from './workspaceNavigation';
import { readModuleContext, rememberModuleContext, restoredModuleState, safeModuleUrl } from './workspaceModuleMemory';

export function useWorkspaceModuleMemory({ owner, ready, activeSkill, setSkill }: { owner: string | null; ready: boolean; activeSkill: string; setSkill: (skill: string, path: false) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const activeModule = moduleFor(location.pathname, location.search, activeSkill);
  const url = location.pathname + location.search + location.hash;
  const latest = useRef({ owner, url });
  latest.current = { owner, url };
  const pending = useRef<{ owner: string | null; url: string; scroll: { x: number; y: number } } | null>(null);

  useEffect(() => {
    if (!ready || !workspaceModules.some(module => module.id === activeModule)) return;
    const module = activeModule as WorkspaceModule;
    if (!safeModuleUrl(url, module)) return;
    const saved = readModuleContext(owner, module);
    const marker = location.state?.workspaceModuleRestore;
    const restoring = pending.current?.owner === owner && pending.current.url === url ? pending.current : saved?.url === url && (navigationType === 'POP' || marker?.owner === owner && marker?.url === url) ? { owner, url, scroll: saved.scroll } : null;
    pending.current = null;
    let scroll = restoring?.scroll || (saved?.url === url ? saved.scroll : { x: window.scrollX, y: window.scrollY });
    const remember = () => rememberModuleContext(owner, module, { url, state: location.state, scroll });
    remember();
    let frame = 0;
    let restoringScroll = Boolean(restoring);
    let mutation: MutationObserver | undefined;
    let resize: ResizeObserver | undefined;
    const gestures = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    const stopRestoring = () => {
      restoringScroll = false;
      cancelAnimationFrame(frame);
      mutation?.disconnect();
      resize?.disconnect();
      gestures.forEach(event => window.removeEventListener(event, onGesture));
    };
    const onGesture = () => { stopRestoring(); scroll = { x: window.scrollX, y: window.scrollY }; remember(); };
    const restoreScroll = () => {
      frame = 0;
      if (!restoringScroll || latest.current.owner !== owner || latest.current.url !== url) return;
      window.scrollTo?.(scroll.x, scroll.y);
      if (Math.abs(window.scrollY - scroll.y) < 1 && Math.abs(window.scrollX - scroll.x) < 1) stopRestoring();
    };
    const scheduleRestore = () => { if (!frame && restoringScroll) frame = requestAnimationFrame(restoreScroll); };
    if (restoring) {
      // Lazy routes and remote content can initially be shorter than their saved scroll.
      mutation = new MutationObserver(scheduleRestore);
      mutation.observe(document.body, { childList: true, subtree: true });
      if (typeof ResizeObserver !== 'undefined') {
        resize = new ResizeObserver(scheduleRestore);
        resize.observe(document.querySelector('main') || document.body);
      }
      gestures.forEach(event => window.addEventListener(event, onGesture, { passive: true }));
      scheduleRestore();
    }
    const onScroll = () => { if (restoringScroll) return; scroll = { x: window.scrollX, y: window.scrollY }; remember(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', remember);
    return () => {
      stopRestoring();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', remember);
      // Use the old route's tracked position; DOM changes may already have moved the new page.
      remember();
    };
  }, [owner, ready, url, location.state, activeModule, navigationType]);

  const selectModule = (module: WorkspaceModule) => {
    if (module === activeModule) return;
    const link = workspaceModules.find(link => link.id === module);
    if (!link) return;
    const context = ready ? readModuleContext(owner, module) : null;
    const destination = context?.url || link.to;
    navigateWithPracticeGuard(destination, () => {
      // A delayed confirmation must never carry the previous account's context to a new owner.
      if (latest.current.owner !== owner) return;
      if (['writing', 'speaking', 'reading', 'listening'].includes(module)) setSkill(module, false);
      pending.current = context ? { owner, url: context.url, scroll: context.scroll } : null;
      navigate(destination, { state: context ? restoredModuleState(context, owner, module) : null });
    });
  };
  return { selectModule };
}
