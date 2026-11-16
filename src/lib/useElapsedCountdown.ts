import { useEffect, useRef } from 'react';

type CountdownOptions = {
  seconds: number;
  running: boolean;
  scope: string;
  setSeconds: (seconds: number) => void;
  onComplete: () => void;
  onBackground: () => void;
};

/** Count active practice accurately; backgrounding requires an explicit resume. */
export function useElapsedCountdown(options: CountdownOptions) {
  const latest = useRef(options);
  const activeScope = useRef(options.scope);
  latest.current = options;
  const { running, scope } = options;

  useEffect(() => {
    const changedScope = activeScope.current !== scope;
    activeScope.current = scope;
    if (!running || changedScope) return;
    const deadline = Date.now() + latest.current.seconds * 1000;
    let previous = latest.current.seconds;
    let completed = false;
    let suspended = false;
    const tick = () => {
      if (completed || suspended || latest.current.scope !== scope) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (remaining !== previous) {
        previous = remaining;
        latest.current.setSeconds(remaining);
      }
      if (remaining === 0) {
        completed = true;
        latest.current.onComplete();
      }
    };
    const visibility = () => {
      tick();
      if (document.visibilityState === 'hidden' && !completed && !suspended) {
        suspended = true;
        latest.current.onBackground();
      }
    };
    const interval = window.setInterval(tick, 250);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', tick);
    visibility();
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', tick);
    };
  }, [running, scope]);
}
