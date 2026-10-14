import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { StateMessage } from './AsyncState';

type Props = { children: ReactNode; resetKey?: string; standalone?: boolean };
type State = { error: Error | null; resetKey?: string };

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
    const importFailed = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .+ failed|error loading dynamically imported module|Failed to load module script/i.test(error.message);
    const reload = importFailed || this.props.standalone;
    return <div className={this.props.standalone ? 'workspace-error-screen' : 'workspace-page-error'}>
      <StateMessage kind="error" title="This page could not open"
        message={importFailed ? 'A page update could not be loaded. Reload to try again.' : 'Try again or return to Today.'}
        onRetry={() => reload ? window.location.reload() : this.setState({ error: null })}
        retryLabel={reload ? 'Reload page' : 'Try again'}>
        {this.props.standalone ? <a className="btn line" href="/today"><ArrowLeft size={16} /> Return to Today</a> : <Link className="btn line" to="/today"><ArrowLeft size={16} /> Return to Today</Link>}
      </StateMessage>
    </div>;
  }
}
