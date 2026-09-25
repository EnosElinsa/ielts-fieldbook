import { useEffect, useState, type ReactNode } from 'react';

const LEAVE_MS = 240;

function leaveMs() {
  const media = typeof window !== 'undefined' ? window.matchMedia : undefined;
  if (typeof media !== 'function') return LEAVE_MS;
  return media.call(window, '(prefers-reduced-motion: reduce)').matches ? 0 : LEAVE_MS;
}

export function ModalFrame({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      const timer = window.setTimeout(() => setMounted(false), leaveMs());
      return () => window.clearTimeout(timer);
    }
    setMounted(true);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [open]);

  useEffect(() => {
    if (!mounted) return undefined;
    const y = window.scrollY;
    const previous = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${y}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = previous.position;
      document.body.style.top = previous.top;
      document.body.style.left = previous.left;
      document.body.style.right = previous.right;
      document.body.style.width = previous.width;
      document.body.style.overflow = previous.overflow;
      window.scrollTo(0, y);
    };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div
      className={visible ? 'modal-bg show' : 'modal-bg'}
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}
