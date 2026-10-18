import { useEffect, useState, type ReactNode } from 'react';
import { useFieldbook } from '../context/FieldbookContext';
import { PageLoadingState, StateMessage } from './AsyncState';
import type { AccountModule } from '../storage/accountModules';
import { accountId } from '../storage/remote';

type Requirements = { modules?: AccountModule[]; banks?: ('writing' | 'speaking')[]; vocabularyEntryIds?: string[] };

export function useAccountRequirements({ modules = [], banks = [], vocabularyEntryIds }: Requirements) {
  const fb = useFieldbook();
  const moduleKey = modules.join('|');
  const bankKey = banks.join('|');
  const vocabularyScope = vocabularyEntryIds === undefined ? 'all' : JSON.stringify([...new Set(vocabularyEntryIds)].sort());
  const requirementKey = JSON.stringify([accountId(),moduleKey,bankKey,vocabularyScope]);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [revision, setRevision] = useState(0);
  const [prepared, setPrepared] = useState('');
  const booting = fb.booted === false;
  const needsVocabulary = Boolean(fb.moduleStatus && modules.includes('vocabulary'));
  const ready = !booting && (!needsVocabulary || prepared === requirementKey) && modules.every(module => !fb.moduleStatus || fb.moduleStatus[module] === 'ready') && banks.every(bank => !fb.bankStatus || fb.bankStatus[bank] === 'ready');
  useEffect(() => {
    if (booting) { setPrepared(''); setFailure(null); return; }
    if (!fb.moduleStatus) return;
    let alive = true; setFailure(null);
    const requests = [
      ...moduleKey.split('|').filter(Boolean).map(module => module === 'vocabulary' && vocabularyScope !== 'all'
        ? fb.ensureAccountModule(module,{entryIds:JSON.parse(vocabularyScope)}) : fb.ensureAccountModule(module)),
      ...bankKey.split('|').filter(Boolean).map(bank => fb.ensureQuestionBank(bank, revision > 0)),
    ];
    Promise.all(requests).then(() => { if (alive) setPrepared(requirementKey); }, cause => { if (alive) setFailure({key:requirementKey,message:cause instanceof Error ? cause.message : 'Could not load study data.'}); });
    return () => { alive = false; };
  }, [booting, moduleKey, bankKey, vocabularyScope, requirementKey, fb.ensureAccountModule, fb.ensureQuestionBank, revision]);
  return { ready, error: failure?.key === requirementKey ? failure.message : '', retry: () => setRevision(value => value + 1) };
}

export function AccountDataBoundary({ children, modules, banks, vocabularyEntryIds }: Requirements & { children: ReactNode }) {
  const { ready, error, retry } = useAccountRequirements({modules,banks,vocabularyEntryIds});
  const fb = useFieldbook();
  const refreshError = error || (banks || []).map(bank => fb.bankErrors?.[bank]).find(Boolean);
  if (!ready && refreshError) return <StateMessage kind="error" title="Study data could not be loaded" message={refreshError} onRetry={retry} />;
  if (!ready) return <PageLoadingState message="Loading study data…" onRetry={retry} retryLabel="Retry study data" />;
  return <>{refreshError && <p role="alert">{refreshError} <button className="btn text" onClick={retry}>Retry</button></p>}{children}</>;
}
