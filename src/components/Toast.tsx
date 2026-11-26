import { useCallback, useEffect, useRef, useState, type FocusEvent } from 'react';
import { X } from 'lucide-react';

/** A notice stays readable for at least five seconds; hover and keyboard focus hold it open. */
export const TOAST_VISIBLE_MS = 5000;
/** Matches the fade-out, so the text is cleared only once it can no longer be seen. */
export const TOAST_FADE_MS = 240;
/** Time left after the pointer or focus leaves, so a notice never vanishes the instant it is released. */
const RELEASE_GRACE_MS = 1200;

type ToastProps = {
  message: string;
  visible: boolean;
  /** Bump for every request so an identical message is announced again. */
  revision?: number;
  duration?: number;
};

export function Toast({ message, visible, revision, duration = TOAST_VISIBLE_MS }: ToastProps) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const timer = useRef<number | null>(null);
  const fade = useRef<number | null>(null);
  const deadline = useRef(0);
  const left = useRef(duration);
  const openRef = useRef(false);
  const hovering = useRef(false);
  const focusing = useRef(false);
  const lastVisible = useRef(false);
  const lastKey = useRef('');

  const clearTimer = useCallback(() => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
  }, []);
  const dismiss = useCallback(() => {
    clearTimer();
    openRef.current = false;
    setOpen(false);
    if (fade.current !== null) window.clearTimeout(fade.current);
    fade.current = window.setTimeout(() => { fade.current = null; setText(''); }, TOAST_FADE_MS);
  }, [clearTimer]);
  const start = useCallback((ms: number) => {
    clearTimer();
    left.current = ms;
    deadline.current = Date.now() + ms;
    timer.current = window.setTimeout(dismiss, ms);
  }, [clearTimer, dismiss]);
  const holding = () => hovering.current || focusing.current;
  const hold = () => {
    if (timer.current === null) return;
    left.current = Math.max(0, deadline.current - Date.now());
    clearTimer();
  };
  const release = () => {
    if (!openRef.current || holding()) return;
    start(Math.max(left.current, RELEASE_GRACE_MS));
  };

  useEffect(() => {
    const key = `${revision ?? ''}|${message}`;
    const rose = visible && !lastVisible.current;
    const changed = visible && key !== lastKey.current;
    lastVisible.current = visible;
    if (!visible) return;
    lastKey.current = key;
    if (!message || !(rose || changed)) return;
    if (fade.current !== null) { window.clearTimeout(fade.current); fade.current = null; }
    setText(message);
    setEpoch(value => value + 1);
    openRef.current = true;
    setOpen(true);
    if (holding()) { clearTimer(); left.current = duration; } else start(duration);
  }, [message, visible, revision, duration, start, clearTimer]);

  useEffect(() => () => {
    clearTimer();
    if (fade.current !== null) window.clearTimeout(fade.current);
  }, [clearTimer]);

  const leaveFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    focusing.current = false;
    release();
  };

  return (
    <div
      id="toast"
      className={`toast${open ? ' show' : ''}`}
      onMouseEnter={() => { hovering.current = true; hold(); }}
      onMouseLeave={() => { hovering.current = false; release(); }}
      onFocus={() => { focusing.current = true; hold(); }}
      onBlur={leaveFocus}
      onKeyDown={(event) => { if (event.key === 'Escape' && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && openRef.current) dismiss(); }}
    >
      <div className="toast-text" role="status" aria-live="polite" aria-atomic="true"><span key={epoch}>{text}</span></div>
      {open ? <button type="button" className="toast-dismiss" aria-label="Dismiss notification" onClick={dismiss}><X size={14} aria-hidden="true" /></button> : null}
    </div>
  );
}
