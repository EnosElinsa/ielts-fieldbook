import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { StateMessage } from './AsyncState';
import { ModalFrame } from './ModalFrame';
import { isPageDownloadError } from '../lib/pageLoadRecovery';

type Props = { children: ReactNode; resetKey?: string; standalone?: boolean; onDismiss?: () => void };
type State = { error: Error | null; resetKey?: string };

function PageFailure({ error, standalone, onRetry, onDismiss }: {
  error: Error;
  standalone?: boolean;
  onRetry: () => void;
  onDismiss?: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const downloadFailed = isPageDownloadError(error);
  const reload = downloadFailed || standalone;
  useEffect(() => {
    const alert = panel.current?.querySelector<HTMLElement>('[role="alert"]');
    if (alert) { alert.tabIndex = -1; alert.focus({ preventScroll: true }); }
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    return () => {
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
    };
  }, []);
  const message = downloadFailed
    ? online
      ? `The ${onDismiss ? 'dialog' : 'page'} files could not be downloaded. Check your connection, then reload this page.`
      : 'You are offline. Reconnect to the internet, then reload this page.'
    : onDismiss ? 'Try again, or close this dialog and keep studying.' : 'Try again or return to Today.';
  return <div ref={panel} className={onDismiss ? 'workspace-dialog-error' : standalone ? 'workspace-error-screen' : 'workspace-page-error'}>
    <StateMessage kind="error" title={onDismiss ? undefined : 'This page could not open'} message={message}
      onRetry={() => reload ? window.location.reload() : onRetry()}
      retryLabel={reload ? 'Reload page' : 'Try again'} retryDisabled={Boolean(reload && !online)}>
      {onDismiss
        ? <button type="button" className="btn line" onClick={onDismiss}>Keep studying</button>
        : reload
        ? <a className="btn line" href="/today"><ArrowLeft size={16} /> Return to Today</a>
        : <Link className="btn line" to="/today"><ArrowLeft size={16} /> Return to Today</Link>}
    </StateMessage>
  </div>;
}

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error) { return { error }; }

  static getDerivedStateFromProps(props: Props, state: State) {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Workspace page failed', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const failure = <PageFailure error={error} standalone={this.props.standalone}
      onRetry={() => this.setState({ error: null })} onDismiss={this.props.onDismiss} />;
    return this.props.onDismiss
      ? <ModalFrame open title="This dialog could not open" header="Workspace" onClose={this.props.onDismiss}>{failure}</ModalFrame>
      : failure;
  }
}
