import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { navigateWithPracticeGuard } from '../lib/practiceNavigation';
import { moduleFor, workspaceModules, type WorkspaceModule } from './workspaceNavigation';
import { readHistoryScrollMemory, readModuleContext, rememberHistoryScrollMemory, rememberModuleContext, restoredModuleState, safeModuleUrl } from './workspaceModuleMemory';
import type { WorkspaceScrollState } from './WorkspaceScrollRestoration';

export function useWorkspaceModuleMemory({ owner, ready, activeSkill, setSkill }: { owner: string | null; ready: boolean; activeSkill: string; setSkill: (skill: string, path: false) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const activeModule = moduleFor(location.pathname, location.search, activeSkill);
  const url = location.pathname + location.search + location.hash;
  const latest = useRef({ owner, url });
  latest.current = { owner, url };
  const pending = useRef<{ owner: string | null; url: string; scroll: { x: number; y: number } } | null>(null);
  const historyScroll = useRef<{ owner: string | null; positions: ReturnType<typeof readHistoryScrollMemory> } | null>(null);
  const scrollRestoration = useRef<WorkspaceScrollState>({ key: location.key, restored: false });
  const previousRoute = useRef<{ owner: string | null; pathname: string } | null>(null);

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);

  useLayoutEffect(() => {
    scrollRestoration.current = { key: location.key, restored: false };
    if (!ready || !workspaceModules.some(module => module.id === activeModule)) return;
    const module = activeModule as WorkspaceModule;
    if (!safeModuleUrl(url, module)) return;
    const saved = readModuleContext(owner, module);
    const marker = location.state?.workspaceModuleRestore;
    if (!historyScroll.current || historyScroll.current.owner !== owner) historyScroll.current = { owner, positions: readHistoryScrollMemory(owner) };
    const positions = historyScroll.current.positions;
    const entry = navigationType === 'POP' ? positions.get(location.key) : null;
    const entryScroll = entry?.url === url ? entry.scroll : null;
    const restoring = pending.current?.owner === owner && pending.current.url === url ? pending.current : entryScroll ? { owner, url, scroll: entryScroll } : saved?.url === url && (navigationType === 'POP' || marker?.owner === owner && marker?.url === url) ? { owner, url, scroll: saved.scroll } : null;
    pending.current = null;
    scrollRestoration.current.restored = Boolean(restoring);
    if (!restoring && !location.hash && previousRoute.current?.owner === owner && previousRoute.current.pathname !== location.pathname) window.scrollTo?.(0, 0);
    previousRoute.current = { owner, pathname: location.pathname };
    let scroll = restoring?.scroll || { x: window.scrollX, y: window.scrollY };
    const remember = () => {
      positions.delete(location.key);
      positions.set(location.key, { url, scroll });
      if (positions.size > 80) positions.delete(positions.keys().next().value!);
      rememberHistoryScrollMemory(owner, positions);
      rememberModuleContext(owner, module, { url, state: location.state, scroll });
    };
    remember();
    let frame = 0;
    let restoringScroll = Boolean(restoring);
    let restorationAllowed = true;
    let mutation: MutationObserver | undefined;
    let resize: ResizeObserver | undefined;
    const gestures = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    const stopRestoring = () => {
      restoringScroll = false;
      cancelAnimationFrame(frame);
      frame = 0;
      mutation?.disconnect();
      resize?.disconnect();
      gestures.forEach(event => window.removeEventListener(event, onGesture));
    };
    const onGesture = () => { restorationAllowed = false; stopRestoring(); scroll = { x: window.scrollX, y: window.scrollY }; remember(); };
    const restoreScroll = () => {
      frame = 0;
      if (!restoringScroll || latest.current.owner !== owner || latest.current.url !== url) return;
      window.scrollTo?.(scroll.x, scroll.y);
      if (Math.abs(window.scrollY - scroll.y) < 1 && Math.abs(window.scrollX - scroll.x) < 1) stopRestoring();
    };
    const scheduleRestore = () => { if (!frame && restoringScroll) frame = requestAnimationFrame(restoreScroll); };
    const startRestoring = () => {
      if (!restorationAllowed) return;
      stopRestoring();
      restoringScroll = true;
      // Lazy routes and remote content can initially be shorter than their saved scroll.
      mutation = new MutationObserver(scheduleRestore);
      mutation.observe(document.body, { childList: true, subtree: true });
      if (typeof ResizeObserver !== 'undefined') {
        resize = new ResizeObserver(scheduleRestore);
        resize.observe(document.querySelector('main') || document.body);
      }
      gestures.forEach(event => window.addEventListener(event, onGesture, { passive: true }));
      scheduleRestore();
    };
    if (restoring) {
      scrollRestoration.current.restoreAfterLayout = startRestoring;
      startRestoring();
    }
    const onScroll = () => { if (restoringScroll) return; scroll = { x: window.scrollX, y: window.scrollY }; remember(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', remember);
    return () => {
      restorationAllowed = false;
      stopRestoring();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', remember);
      // Use the old route's tracked position; DOM changes may already have moved the new page.
      remember();
    };
  }, [owner, ready, url, location.key, location.state, activeModule, navigationType]);

  const selectModule = (module: WorkspaceModule) => {
    if (module === activeModule) return;
    const link = workspaceModules.find(link => link.id === module);
    if (!link) return;
    // Planning is an overview: task deep links still work when opened explicitly.
    const context = ready && module !== 'planning' ? readModuleContext(owner, module) : null;
    const destination = context?.url || link.to;
    navigateWithPracticeGuard(destination, () => {
      // A delayed confirmation must never carry the previous account's context to a new owner.
      if (latest.current.owner !== owner) return;
      if (['writing', 'speaking', 'reading', 'listening'].includes(module)) setSkill(module, false);
      pending.current = context ? { owner, url: context.url, scroll: context.scroll } : null;
      navigate(destination, { state: context ? restoredModuleState(context, owner, module) : null });
    });
  };
  return { selectModule, scrollRestoration };
}
