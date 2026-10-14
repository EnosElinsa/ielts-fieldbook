import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ModalFrame } from './ModalFrame';

type ConfirmationOptions = { title?: string; description?: string; confirmLabel?: string; destructive?: boolean };

export function useConfirmationDialog(scope?: string): { confirm: (options: ConfirmationOptions | string) => Promise<boolean>; dialog: ReactNode } {
  const [options, setOptions] = useState<ConfirmationOptions | null>(null);
  const pending = useRef<((accepted: boolean) => void) | null>(null);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const settle = useCallback((accepted: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setOptions(null);
    resolve?.(accepted);
  }, []);
  useEffect(() => {
    setOptions(null);
    return () => { const resolve = pending.current; pending.current = null; resolve?.(false); };
  }, [scope]);
  const confirm = useCallback((input: ConfirmationOptions | string) => {
    pending.current?.(false);
    const requestedScope = currentScope.current;
    setOptions(typeof input === 'string' ? { description: input } : input);
    return new Promise<boolean>(resolve => { pending.current = accepted => resolve(accepted && currentScope.current === requestedScope); });
  }, []);
  return {
    confirm,
    dialog: <ModalFrame open={Boolean(options)} onClose={() => settle(false)} title={options?.title || 'Confirm'} description={options?.description} size="sm" footer={<><button type="button" className="btn line" onClick={() => settle(false)}>Cancel</button><button type="button" className={`btn ${options?.destructive ? 'danger' : 'primary'}`} onClick={() => settle(true)}>{options?.confirmLabel || 'Continue'}</button></>}><span /></ModalFrame>,
  };
}
