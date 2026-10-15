import { useEffect, useState, type ReactNode } from 'react';

type LoadingProps = {
  message?: string;
  variant?: 'bank' | 'workbench' | 'cards' | 'document';
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
};

/** Decorative placeholders never add announcements or pretend to show progress. */
export function CardSkeleton({ className = '' }: { className?: string }) {
  return <div className={`async-skeleton-card ${className}`} aria-hidden="true">
    <div className="async-skeleton-card-top"><span className="async-skeleton-icon" /><span className="async-skeleton-chip" /></div>
    <span className="async-skeleton-line is-heading" />
    <span className="async-skeleton-line" />
    <span className="async-skeleton-line is-medium" />
    <span className="async-skeleton-action" />
  </div>;
}

function DocumentSkeleton({ compact = false }: { compact?: boolean }) {
  return <div className="async-skeleton-paper">
    <span className="async-skeleton-line is-short" /><span className="async-skeleton-line is-heading" />
    {Array.from({ length: compact ? 2 : 3 }, (_, index) => <div className="async-skeleton-paragraph" key={index}><span className="async-skeleton-line" /><span className="async-skeleton-line" /><span className="async-skeleton-line is-medium" /></div>)}
  </div>;
}

function WorkbenchSkeleton() {
  return <><DocumentSkeleton /><div className="async-skeleton-answers">
    <div className="async-skeleton-nav">{Array.from({ length: 7 }, (_, index) => <span key={index} className="async-skeleton-chip" />)}</div>
    {[0, 1].map(index => <div className="async-skeleton-question" key={index}><span className="async-skeleton-line is-short" /><span className="async-skeleton-line is-heading" />{[0, 1, 2].map(option => <div className="async-skeleton-option" key={option}><span className="async-skeleton-check" /><span className="async-skeleton-line" /></div>)}</div>)}
  </div></>;
}

function LoadingMark() { return <span className="async-loading-mark" aria-hidden="true"><span /></span>; }

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
    <LoadingMark />{status}
    {slow && canRetry ? <button type="button" className="btn line" onClick={retry}>{retryLabel}</button> : null}
  </span>;
  return <div className={`async-loading async-loading-${size} async-loading-${variant} ${className}`} aria-busy="true">
    <div className="async-loading-status"><LoadingMark /><div className="async-loading-copy">{size === 'page' && <span className="async-loading-caption" aria-hidden="true">IELTS Fieldbook</span>}{status}</div>{slow && canRetry ? <button type="button" className="btn line" onClick={retry}>{retryLabel}</button> : null}</div>
    <div className={`async-skeleton-layout async-skeleton-${variant}`} aria-hidden="true">
      {variant === 'workbench' ? <WorkbenchSkeleton /> : variant === 'document' ? <DocumentSkeleton compact={size === 'panel'} /> : Array.from({ length: variant === 'bank' ? 4 : size === 'panel' ? 2 : 3 }, (_, index) => <CardSkeleton key={index} />)}
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
