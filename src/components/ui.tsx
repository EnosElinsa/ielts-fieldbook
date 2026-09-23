export function Empty({
  message,
  label,
  onAction,
}: {
  message: string;
  label?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <p>{message}</p>
      {label && onAction ? (
        <button type="button" className="btn line" onClick={onAction}>
          {label}
        </button>
      ) : null}
    </div>
  );
}

export function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div id="toast" className={`toast${visible ? ' show' : ''}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}

export const NavIcons = {
  today: (
    <svg viewBox="0 0 16 16" width="16" height="16">
      <path d="M2.5 7.2 8 2.8l5.5 4.4V13.2H10V9.2H6v4H2.5z" />
    </svg>
  ),
  questions: (
    <svg viewBox="0 0 16 16" width="16" height="16">
      <rect x="2.2" y="2.2" width="4.6" height="4.6" />
      <rect x="9.2" y="2.2" width="4.6" height="4.6" />
      <rect x="2.2" y="9.2" width="4.6" height="4.6" />
      <rect x="9.2" y="9.2" width="4.6" height="4.6" />
    </svg>
  ),
  write: (
    <svg viewBox="0 0 16 16" width="16" height="16">
      <path d="M9.2 3.2 12.8 6.8 6 13.5H2.5V10z" />
      <path d="M8.2 4.2 11.8 7.8" />
    </svg>
  ),
  review: (
    <svg viewBox="0 0 16 16" width="16" height="16">
      <path d="M13 8a5 5 0 1 1-1.4-3.4" />
      <path d="M12.2 2.2v3.2H9" />
    </svg>
  ),
  phrases: (
    <svg viewBox="0 0 16 16" width="16" height="16">
      <path d="M8 1.8 9.1 6.2 13.4 8 9.1 9.8 8 14.2 6.9 9.8 2.6 8 6.9 6.2z" />
    </svg>
  ),
  progress: (
    <svg viewBox="0 0 16 16" width="16" height="16">
      <path d="M3 13V8M8 13V3M13 13V6" />
    </svg>
  ),
  stories: (
    <svg viewBox="0 0 16 16" width="16" height="16">
      <path d="M3 3.2h4.2A2 2 0 0 1 9 4.6V13a2 2 0 0 0-1.8-1.2H3zM13 3.2H8.8A2 2 0 0 0 7 4.6V13a2 2 0 0 1 1.8-1.2H13z" />
    </svg>
  ),
};
