import { useEffect, useRef } from 'react';

type CountdownOptions = {
  seconds: number;
  running: boolean;
  scope: string;
  setSeconds: (seconds: number) => void;
  onComplete: () => void;
};

/** Renders remaining wall-clock time even when browser ticks are delayed. */
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
    const tick = () => {
      if (completed || latest.current.scope !== scope) return;
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
    const interval = window.setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    tick();
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [running, scope]);
}
