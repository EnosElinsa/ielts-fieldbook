/** Vite reports both failed page scripts and failed page stylesheets here. */
export function isPageDownloadError(error: unknown): boolean {
  const message = error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : '';
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading (?:CSS )?chunk .+ failed|error loading dynamically imported module|Failed to load module script|Unable to preload CSS for/i.test(message);
}

/** Recover an interrupted first load, before the learner can have started work. */
export function installPageLoadRecovery(reload = () => window.location.reload()) {
  const initialUrl = window.location.href;
  const started = performance.now();
  const build = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src || import.meta.url;
  const storageKey = 'fieldbook:page-download-recovery';
  let active = true;
  const interactionEvents = ['pointerdown', 'keydown', 'input', 'change', 'submit', 'popstate'] as const;
  const stop = () => {
    active = false;
    interactionEvents.forEach(type => window.removeEventListener(type, stop, true));
    window.removeEventListener('vite:preloadError', recover);
  };
  const recover = (event: Event) => {
    if (!active || navigator.onLine === false || window.location.href !== initialUrl ||
        performance.now() - started > 30_000 ||
        !isPageDownloadError((event as Event & { payload?: unknown }).payload)) return;
    // Persist before reloading. If storage is blocked, keep the explicit recovery
    // screen instead of risking a reload loop in privacy-restricted browsers.
    try {
      if (sessionStorage.getItem(storageKey) === build) return;
      sessionStorage.setItem(storageKey, build);
    } catch { return; }
    stop();
    event.preventDefault();
    reload();
  };
  interactionEvents.forEach(type => window.addEventListener(type, stop, true));
  window.addEventListener('vite:preloadError', recover);
  return stop;
}
