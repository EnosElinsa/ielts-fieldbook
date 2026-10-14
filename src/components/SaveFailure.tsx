import { RotateCcw } from 'lucide-react';

export function SaveFailure({ failed, saving = false, onRetry, message = 'Could not save to your account. Try again.', role = 'status' }: { failed: boolean; saving?: boolean; onRetry?: () => void; message?: string; role?: 'status' | 'alert' }) {
  if (!failed) return null;
  return (
    <div className="save-failure" role={role} aria-busy={saving || undefined}>
      <span>{message}</span>
      {onRetry && <button type="button" className="btn line" disabled={saving} onClick={onRetry}><RotateCcw size={15} />{saving ? 'Saving…' : 'Retry save'}</button>}
    </div>
  );
}
