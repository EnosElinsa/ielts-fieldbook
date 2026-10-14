import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from './IconButton';

export const BANK_PAGE_SIZE = 12;

export function bankPage(requested: string | null, total: number) {
  const count = Math.max(1, Math.ceil(total / BANK_PAGE_SIZE));
  const value = Number(requested || 1);
  return Math.min(count, Math.max(1, Number.isSafeInteger(value) ? value : 1));
}

export function BankPagination({ total, page, onChange, label }: {
  total: number; page: number; onChange: (page: number) => void; label: string;
}) {
  if (!total) return null;
  const count = Math.ceil(total / BANK_PAGE_SIZE);
  return <nav className="bank-pagination" aria-label={label}>
    <span role="status">{(page - 1) * BANK_PAGE_SIZE + 1}-{Math.min(total, page * BANK_PAGE_SIZE)} of {total}</span>
    <div>
      <IconButton label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={18} /></IconButton>
      <span>Page {page} of {count}</span>
      <IconButton label="Next page" disabled={page >= count} onClick={() => onChange(page + 1)}><ChevronRight size={18} /></IconButton>
    </div>
  </nav>;
}
