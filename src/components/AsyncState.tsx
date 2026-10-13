import { useEffect, useState, type ReactNode } from 'react';

type LoadingProps = {
  message?: string;
  variant?: 'bank' | 'workbench' | 'cards';
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
};

/** Decorative placeholders never add announcements or pretend to show progress. */
export function CardSkeleton({ className = '' }: { className?: string }) {
  return <div className={`async-skeleton-card ${className}`} aria-hidden="true">
    <span className="async-skeleton-line is-short" />
    <span className="async-skeleton-line is-heading" />
    <span className="async-skeleton-line" />
    <span className="async-skeleton-line is-medium" />
    <span className="async-skeleton-action" />
  </div>;
}

function LoadingState({ message = 'Loading…', variant = 'cards', onRetry, retryLabel = 'Retry loading', className = '', size }: LoadingProps & { size: 'page' | 'panel' | 'inline' }) {
  const [slow, setSlow] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const canRetry = Boolean(onRetry);
  useEffect(() => {
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [message, retryCount]);
  const retry = () => {
    setSlow(false);
    setRetryCount(value => value + 1);
    onRetry?.();
  };
  const status = <span role="status" aria-live="polite" aria-atomic="true">{message}{slow ? <span className="async-slow-message"> Taking longer than usual.</span> : null}</span>;
  if (size === 'inline') return <span className={`async-loading async-loading-inline ${className}`} aria-busy="true">
    <span className="async-loading-dot" aria-hidden="true" />{status}
    {slow && canRetry ? <button type="button" className="btn line" onClick={retry}>{retryLabel}</button> : null}
  </span>;
  return <div className={`async-loading async-loading-${size} async-loading-${variant} ${className}`} aria-busy="true">
    <div className="async-loading-status">{status}{slow && canRetry ? <button type="button" className="btn line" onClick={retry}>{retryLabel}</button> : null}</div>
    <div className={`async-skeleton-layout async-skeleton-${variant}`} aria-hidden="true">
      {variant === 'workbench' ? <><CardSkeleton className="async-skeleton-sidebar" /><div className="async-skeleton-main"><CardSkeleton /><CardSkeleton /></div></> : Array.from({ length: variant === 'bank' ? 4 : size === 'panel' ? 2 : 3 }, (_, index) => <CardSkeleton key={index} />)}
    </div>
  </div>;
}

export function PageLoadingState(props: LoadingProps) { return <LoadingState {...props} size="page" />; }
export function PanelLoadingState(props: LoadingProps) { return <LoadingState {...props} size="panel" />; }
export function InlineLoadingState(props: Omit<LoadingProps, 'variant'>) { return <LoadingState {...props} size="inline" />; }

export function StateMessage({ kind = 'empty', title, message, onRetry, retryLabel = 'Retry loading', retryDisabled = false, children, className = '', inline = false }: {
  kind?: 'error' | 'empty';
  title?: string;
  message?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  retryDisabled?: boolean;
  children?: ReactNode;
  className?: string;
  inline?: boolean;
}) {
  const action = onRetry ? <button type="button" className="btn line" disabled={retryDisabled} onClick={onRetry}>{retryLabel}</button> : null;
  if (inline) return <span className={`async-state async-state-inline async-state-${kind} ${className}`} role={kind === 'error' ? 'alert' : undefined}>{title ? <strong>{title}</strong> : null}{message}{action}{children}</span>;
  return <div className={`async-state async-state-${kind} ${className}`}>
    <div role={kind === 'error' ? 'alert' : undefined}>{title ? <h3>{title}</h3> : null}{message ? <p>{message}</p> : null}</div>
    {action}{children}
  </div>;
}
