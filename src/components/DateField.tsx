import * as Dialog from '@radix-ui/react-dialog';
import { CalendarDays, X } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';

const DateCalendar = lazy(() => import('./DateCalendar'));

export function DateField({ id, label, value, onChange, min, max }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}) {
  const [edit, setEdit] = useState<{ previous: string; text: string } | null>(null);
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);
  const pending = edit?.previous === value ? edit : null;

  const accept = (next: string) => {
    setEdit(null);
    setNotice('');
    onChange(next);
  };

  return <div className="date-field">
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className="date-field-control">
        <input id={id} type="text" className="filter-trigger" aria-label={label}
          placeholder="YYYY-MM-DD" aria-describedby={`${id}-format`}
          value={pending?.text ?? value} autoComplete="off" spellCheck={false}
          onChange={event => {
            const text = event.currentTarget.value;
            const next = text.trim();
            const valid = /^\d{4}-\d{2}-\d{2}$/.test(next) &&
              !next.startsWith('0000-') &&
              new Date(`${next}T00:00:00Z`).toJSON()?.slice(0, 10) === next;
            if (!next || (valid && (!min || next >= min) && (!max || next <= max))) {
              accept(next);
            } else {
              setNotice('');
              setEdit({ previous: value, text });
            }
          }}
          onBlur={() => {
            if (!pending) return;
            setEdit(null);
            const bounds = min && max ? ` from ${min} to ${max}` :
              min ? ` on or after ${min}` : max ? ` on or before ${max}` : '';
            setNotice(`Use a valid date in YYYY-MM-DD format${bounds}. The date field was restored.`);
          }}
        />
        <span id={`${id}-format`} className="sr-only">Enter a date in year, month, day format.</span>
        <Dialog.Trigger type="button" className="icon-button date-field-picker" aria-label={`Open calendar for ${label.toLowerCase()}`}>
          <CalendarDays size={17} aria-hidden="true" />
        </Dialog.Trigger>
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay date-calendar-overlay" />
        <Dialog.Content className="dialog-content date-calendar" aria-describedby={undefined}>
          <div className="date-calendar-header">
            <Dialog.Title>{label}</Dialog.Title>
            <Dialog.Close type="button" className="icon-button" aria-label="Close calendar"><X size={18} aria-hidden="true" /></Dialog.Close>
          </div>
          <Suspense fallback={<p role="status" className="date-calendar-loading">Loading calendar…</p>}>
            <DateCalendar value={value} min={min} max={max} onSelect={next => { accept(next); setOpen(false); }} />
          </Suspense>
          {value && <Dialog.Close asChild>
            <button type="button" className="btn line date-calendar-clear" onClick={() => accept('')}>Clear date</button>
          </Dialog.Close>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    {notice && <p className="date-field-notice" role="status">{notice}</p>}
  </div>;
}
