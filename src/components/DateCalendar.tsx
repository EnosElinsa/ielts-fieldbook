import { DayPicker } from 'react-day-picker';
import { enGB } from 'react-day-picker/locale';
import { dateKey } from '../domain/utils';
import 'react-day-picker/style.css';
import '../styles/date-calendar.css';

export default function DateCalendar({ value, min, max, onSelect }: {
  value: string;
  min?: string;
  max?: string;
  onSelect: (value: string) => void;
}) {
  const selected = value ? new Date(`${value}T12:00:00`) : undefined;
  const earliest = min ? new Date(`${min}T12:00:00`) : undefined;
  const latest = max ? new Date(`${max}T12:00:00`) : undefined;
  const initial = selected ?? new Date();
  const month = earliest && initial < earliest ? earliest : latest && initial > latest ? latest : initial;

  return <DayPicker
    mode="single"
    required
    lang="en"
    locale={enGB}
    autoFocus
    selected={selected}
    defaultMonth={month}
    startMonth={earliest}
    endMonth={latest}
    disabled={[...(earliest ? [{ before: earliest }] : []), ...(latest ? [{ after: latest }] : [])]}
    onSelect={day => onSelect(dateKey(day))}
  />;
}
