import { useEffect, useState, type ReactNode } from 'react';
import { useFieldbook } from '../context/FieldbookContext';
import { PageLoadingState, PanelLoadingState, StateMessage, type LoadingVariant } from './AsyncState';
import { ModalFrame } from './ModalFrame';
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
  const needsVocabulary = Boolean(fb.moduleStatus && modules.some(module=>module.startsWith('vocabulary')));
  const ready = !booting && (!needsVocabulary || prepared === requirementKey) && modules.every(module => !fb.moduleStatus || fb.moduleStatus[module] === 'ready') && banks.every(bank => !fb.bankStatus || fb.bankStatus[bank] === 'ready');
  useEffect(() => {
    if (booting) { setPrepared(''); setFailure(null); return; }
    if (!fb.moduleStatus) return;
    let alive = true; setFailure(null);
    const requests = [
      ...moduleKey.split('|').filter(Boolean).map(module => module.startsWith('vocabulary') && vocabularyScope !== 'all'
        ? fb.ensureAccountModule(module,{entryIds:JSON.parse(vocabularyScope)}) : fb.ensureAccountModule(module)),
      ...bankKey.split('|').filter(Boolean).map(bank => fb.ensureQuestionBank(bank, revision > 0)),
    ];
    Promise.all(requests).then(() => { if (alive) setPrepared(requirementKey); }, cause => { if (alive) setFailure({key:requirementKey,message:cause instanceof Error ? cause.message : 'Could not load study data.'}); });
    return () => { alive = false; };
  }, [booting, moduleKey, bankKey, vocabularyScope, requirementKey, fb.ensureAccountModule, fb.ensureQuestionBank, revision]);
  return { ready, error: failure?.key === requirementKey ? failure.message : '', retry: () => setRevision(value => value + 1) };
}

const GENERIC_LOAD_ERROR = 'Could not load study data.';
const GUIDANCE = 'Check your connection, then retry. Work you already saved is safe.';

function useLoadFailure(banks: Requirements['banks'], error: string) {
  const fb = useFieldbook();
  return error || (banks || []).map(bank => fb.bankErrors?.[bank]).find(Boolean) || '';
}

export function AccountDataBoundary({ children, modules, banks, vocabularyEntryIds, variant = 'cards', area = 'study data', title }: Requirements & { children: ReactNode; variant?: LoadingVariant; area?: string; title?: string }) {
  const { ready, error, retry } = useAccountRequirements({modules,banks,vocabularyEntryIds});
  const refreshError = useLoadFailure(banks, error);
  const detail = refreshError && refreshError !== GENERIC_LOAD_ERROR ? refreshError : '';
  if (!ready && refreshError) return <StateMessage kind="error" title={`Your ${area} could not load`} message={<>{GUIDANCE}{detail ? <small className="async-state-detail">{detail}</small> : null}</>} onRetry={retry} retryLabel="Retry" />;
  if (!ready) return <PageLoadingState title={title} message={`Loading your ${area}…`} variant={variant} onRetry={retry} retryLabel="Retry" />;
  return <>{refreshError && <p className="async-refresh-error"><StateMessage inline kind="error" title={`Some ${area} could not refresh. `} message={detail ? `${detail} ` : 'Showing what is already saved. '} onRetry={retry} retryLabel="Retry" /></p>}{children}</>;
}

/**
 * Dialogs that need account data sit inside this wrapper, not the other way round. The dialog frame
 * is present while data loads or fails, so the page behind it is never left under a blank overlay
 * that cannot be closed. The wrapped dialog renders its own frame once the data is ready.
 */
export function ModalDataBoundary({ children, modules, banks, vocabularyEntryIds, title, area = 'study data', onClose }: Requirements & { children: ReactNode; title: string; area?: string; onClose: () => void }) {
  const { ready, error, retry } = useAccountRequirements({ modules, banks, vocabularyEntryIds });
  const failure = useLoadFailure(banks, error);
  if (ready) return <>{children}</>;
  const detail = failure && failure !== GENERIC_LOAD_ERROR ? failure : '';
  return <ModalFrame open onClose={onClose} title={title}>
    {failure
      ? <StateMessage kind="error" title={`Your ${area} could not load`} message={<>{GUIDANCE}{detail ? <small className="async-state-detail">{detail}</small> : null}</>} onRetry={retry} retryLabel="Retry" />
      : <PanelLoadingState variant="form" message={`Loading your ${area}…`} onRetry={retry} retryLabel="Retry" />}
  </ModalFrame>;
}
