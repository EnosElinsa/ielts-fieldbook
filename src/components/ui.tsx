import { SelectField } from './SelectField';
import { House, Library, PencilLine, RotateCcw, ChartNoAxesCombined, NotebookTabs, CircleUserRound, Mic2, Settings2 } from 'lucide-react';

export function FilterMenu({ label, value, options, onChange, disabled }: {
  label:string; value:string; options:{value:string;label:string;disabled?:boolean}[];
  onChange:(value:string)=>void; disabled?:boolean;
}) {
  // A value from the URL that is not an option still names itself instead of leaving a blank trigger.
  const unknown = value != null && value !== '' && !options.some(option => option.value === value);
  const choices = unknown ? [...options, { value, label: `${label}: ${value}`, disabled: true }] : options;
  return <div className="filter-menu"><SelectField aria-label={label} value={value} options={choices} onValueChange={onChange} disabled={disabled}/></div>;
}

/** Native date editing keeps browser keyboard, locale and assistive-technology support. */
export function DateField({ id, label, value, onChange, min, max }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  min?: string; max?: string;
}) {
  return <div className="filter-menu date-field"><input id={id} type="date" className="filter-trigger" aria-label={label}
    value={value} min={min} max={max} onChange={event => {
      if (event.currentTarget.validity.valid) onChange(event.currentTarget.value);
    }} /></div>;
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
