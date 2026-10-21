import { SelectField } from './SelectField';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays, House, Library, PencilLine, RotateCcw, ChartNoAxesCombined, NotebookTabs, CircleUserRound, Mic2, Settings2 } from 'lucide-react';

export function FilterMenu({ label, value, options, onChange, disabled }: {
  label:string; value:string; options:{value:string;label:string;disabled?:boolean}[];
  onChange:(value:string)=>void; disabled?:boolean;
}) {
  return <div className="filter-menu"><SelectField aria-label={label} triggerRole="button" value={value} options={options} onValueChange={onChange} disabled={disabled}/></div>;
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
  min,
  max,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}) {
  const selected = parseIso(value);
  const today = new Date();
  const todayIso = isoFrom(today);
  const initialDate = selected || parseIso(min && todayIso < min ? min : max && todayIso > max ? max : todayIso) || today;
  const outsideRange = (iso: string) => Boolean((min && iso < min) || (max && iso > max));
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => initialDate);
  const [popupLayout, setPopupLayout] = useState({ above: false, maxHeight: 340 });
  const root = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const popId = useId();

  useEffect(() => {
    if (selected) setCursor(selected);
  }, [value]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const position = () => {
      if (!root.current || !popup.current) return;
      const trigger = root.current.getBoundingClientRect();
      const bottomInset = window.innerWidth <= 740 ? 80 : 16;
      const below = window.innerHeight - trigger.bottom - bottomInset;
      const above = trigger.top - 16;
      const opensAbove = below < Math.min(popup.current.scrollHeight, 340) + 6 && above > below;
      setPopupLayout({ above: opensAbove, maxHeight: Math.max(0, Math.min(340, (opensAbove ? above : below) - 6)) });
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open]);

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
          if (!open) {
            setCursor(initialDate);
            window.dispatchEvent(new CustomEvent('fieldbook-popover', { detail: popId }));
          }
          setOpen(!open);
        }}
      >
        <span>{labelText}</span>
        <CalendarDays size={14} aria-hidden="true" />
      </button>
      {open ? (
        <div className={`filter-pop date-pop${popupLayout.above ? ' opens-above' : ''}`} style={{ maxHeight: popupLayout.maxHeight }} ref={popup} id={popId} role="dialog" aria-label={label}>
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
                  aria-label={date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  disabled={outsideRange(iso)}
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
              disabled={outsideRange(todayIso)}
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
  today: <House size={18} />,
  questions: <Library size={18} />,
  write: <PencilLine size={18} />,
  speaking: <Mic2 size={18} />,
  settings: <Settings2 size={18} />,
  review: <RotateCcw size={18} />,
  vocabulary: <NotebookTabs size={18} />,
  progress: <ChartNoAxesCombined size={18} />,
  stories: <NotebookTabs size={18} />,
  account: <CircleUserRound size={18} />,
};
