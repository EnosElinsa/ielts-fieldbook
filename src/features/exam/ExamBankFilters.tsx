import { useEffect, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { FilterMenu } from '../../components/ui';

type Filter = { key: string; label: string; value: string; options: { value: string; label: string }[] };

/** Keep URL-backed controls mounted when collapsed, including unknown saved filter values. */
export function ExamBankFilters({ filters, onChange }: { filters: Filter[]; onChange: (key: string, value: string) => void }) {
  const [expanded, setExpanded] = useState(() => !window.matchMedia?.('(max-width: 740px)').matches);
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 740px)');
    if (!media) return;
    const resize = () => setExpanded(!media.matches);
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  const active = filters.filter(filter => filter.value !== 'all');
  return <>
    <details className="exam-filter-panel" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary><SlidersHorizontal size={16} aria-hidden="true" />Filters{active.length > 0 && <span className="exam-filter-count">{active.length}</span>}</summary>
      <div className="exam-filter-fields">{filters.map(filter => <FilterMenu key={filter.key} label={filter.label} value={filter.value} options={filter.options} onChange={value => onChange(filter.key, value)} />)}</div>
    </details>
    {active.length > 0 && <div className="exam-active-filters" aria-label="Active filters">{active.map(filter => <button type="button" className="btn line" key={filter.key} aria-label={`Remove ${filter.label} filter: ${filter.options.find(option => option.value === filter.value)?.label || filter.value}`} onClick={() => onChange(filter.key, 'all')}>
      <span>{filter.label}: {filter.options.find(option => option.value === filter.value)?.label || filter.value}</span><X size={14} aria-hidden="true" />
    </button>)}</div>}
  </>;
}
