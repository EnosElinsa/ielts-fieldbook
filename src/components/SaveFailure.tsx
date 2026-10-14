import { RotateCcw } from 'lucide-react';

export function SaveFailure({ failed, saving = false, onRetry }: { failed: boolean; saving?: boolean; onRetry?: () => void }) {
  if (!failed) return null;
  return (
    <div className="save-failure" role="status">
      <span>Could not save to your account. Try again.</span>
      {onRetry && <button type="button" className="btn line" disabled={saving} onClick={onRetry}><RotateCcw size={15} />{saving ? 'Saving...' : 'Retry save'}</button>}
    </div>
  );
}
