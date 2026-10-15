import { useEffect, useState, type ReactNode } from 'react';
import { useFieldbook } from '../context/FieldbookContext';
import { PageLoadingState, StateMessage } from './AsyncState';
import type { AccountModule } from '../storage/accountModules';

type Requirements = { modules?: AccountModule[]; banks?: ('writing' | 'speaking')[] };

export function useAccountRequirements({ modules = [], banks = [] }: Requirements) {
  const fb = useFieldbook();
  const moduleKey = modules.join('|');
  const bankKey = banks.join('|');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const ready = modules.every(module => !fb.moduleStatus || fb.moduleStatus[module] === 'ready') && banks.every(bank => !fb.bankStatus || fb.bankStatus[bank] === 'ready');
  useEffect(() => {
    if (!fb.moduleStatus) return;
    let alive = true; setError('');
    const requests = [
      ...moduleKey.split('|').filter(Boolean).map(module => fb.ensureAccountModule(module)),
      ...bankKey.split('|').filter(Boolean).map(bank => fb.ensureQuestionBank(bank, revision > 0)),
    ];
    Promise.all(requests).catch(cause => { if (alive) setError(cause instanceof Error ? cause.message : 'Could not load study data.'); });
    return () => { alive = false; };
  }, [moduleKey, bankKey, fb.ensureAccountModule, fb.ensureQuestionBank, revision]);
  return { ready, error, retry: () => setRevision(value => value + 1) };
}

export function AccountDataBoundary({ children, modules, banks }: Requirements & { children: ReactNode }) {
  const { ready, error, retry } = useAccountRequirements({modules,banks});
  const fb = useFieldbook();
  const refreshError = error || (banks || []).map(bank => fb.bankErrors?.[bank]).find(Boolean);
  if (!ready && refreshError) return <StateMessage kind="error" title="Study data could not be loaded" message={refreshError} onRetry={retry} />;
  if (!ready) return <PageLoadingState message="Loading study data…" onRetry={retry} retryLabel="Retry study data" />;
  return <>{refreshError && <p role="alert">{refreshError} <button className="btn text" onClick={retry}>Retry</button></p>}{children}</>;
}
