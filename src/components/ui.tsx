import { useEffect, useId, useRef, useState } from 'react';

export function FilterMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onOther = (event: Event) => {
      if ((event as CustomEvent).detail !== listId) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('fieldbook-popover', onOther);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('fieldbook-popover', onOther);
    };
  }, [open, listId]);

  return (
    <div className={`filter-menu${open ? ' is-open' : ''}`} ref={root}>
      <button
        type="button"
        className="filter-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((currentOpen) => {
            const next = !currentOpen;
            if (next) window.dispatchEvent(new CustomEvent('fieldbook-popover', { detail: listId }));
            return next;
          });
        }}
      >
        <span>{current?.label}</span>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M4 6.2 8 10.2 12 6.2" />
        </svg>
      </button>
      {open ? (
        <div className="filter-pop" id={listId} role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? 'is-current' : undefined}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function parseIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoFrom(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function DateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = parseIso(value);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => selected || new Date());
  const root = useRef<HTMLDivElement>(null);
  const popId = useId();

  useEffect(() => {
    if (selected) setCursor(selected);
  }, [value]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onOther = (event: Event) => {
      if ((event as CustomEvent).detail !== popId) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('fieldbook-popover', onOther);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('fieldbook-popover', onOther);
    };
  }, [open, popId]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
  const today = new Date();
  const labelText = selected
    ? selected.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Choose a date';

  return (
    <div className={`filter-menu date-field${open ? ' is-open' : ''}`} ref={root}>
      <button
        id={id}
        type="button"
        className="filter-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popId}
        onClick={() => {
          setOpen((current) => {
            const next = !current;
            if (next) window.dispatchEvent(new CustomEvent('fieldbook-popover', { detail: popId }));
            return next;
          });
        }}
      >
        <span>{labelText}</span>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
          <path d="M2.5 6.5h11M5.5 2.5v2M10.5 2.5v2" />
        </svg>
      </button>
      {open ? (
        <div className="filter-pop date-pop" id={popId} role="dialog" aria-label={label}>
          <div className="date-nav">
            <button type="button" aria-label="Previous month" onClick={() => setCursor(new Date(year, month - 1, 1))}>
              ‹
            </button>
            <strong>
              {cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </strong>
            <button type="button" aria-label="Next month" onClick={() => setCursor(new Date(year, month + 1, 1))}>
              ›
            </button>
          </div>
          <div className="date-week">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
          <div className="date-grid">
            {days.map((date) => {
              const iso = isoFrom(date);
              const outside = date.getMonth() !== month;
              const isToday = isoFrom(today) === iso;
              const isSelected = value === iso;
              return (
                <button
                  key={iso}
                  type="button"
                  className={`${outside ? 'is-out' : ''}${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}`}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="date-foot">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                const next = new Date();
                onChange(isoFrom(next));
                setCursor(next);
                setOpen(false);
              }}
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

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
