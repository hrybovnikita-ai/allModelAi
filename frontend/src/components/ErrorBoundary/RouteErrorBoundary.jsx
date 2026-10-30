import { Component, Fragment } from 'react';
import { isAuthDebugPanelEnabled } from '../../lib/authDebugPanel.js';
import { readStoredSessionUser } from '../../lib/session.js';

function safeAuthDebugSnapshot() {
  const hint = readStoredSessionUser();
  return {
    pathname: typeof window !== 'undefined' ? window.location.pathname : '',
    authenticatedUserHint: hint?.email ? 'YES' : 'NO',
  };
}

export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, componentStack: '', recoveryKey: 0 };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ componentStack: info?.componentStack || '' });
    console.error('[AllModelAI] Route render error', error, info?.componentStack);
  }

  render() {
    const { error, componentStack } = this.state;
    if (error) {
      const debug = isAuthDebugPanelEnabled();
      const snapshot = debug ? safeAuthDebugSnapshot() : null;
      return (
        <main className="dashboard-page auth-recovery-panel" role="alert">
          <h1>Something went wrong</h1>
          <p>{debug ? (error?.message || 'This page could not be loaded.') : 'This page could not be loaded. Please refresh or try again.'}</p>
          {!debug && error?.message ? (
            <p className="settings-field-hint">If this happened after changing language, use Try again to reset your language preference on this device.</p>
          ) : null}
          {debug && (
            <details open className="auth-debug-panel">
              <summary>Debug details (authdebug=1)</summary>
              <pre className="auth-debug-pre">
                {`pathname: ${snapshot.pathname}\nauthenticatedUserHint: ${snapshot.authenticatedUserHint}\n\n${componentStack || '(no component stack)'}`}
              </pre>
            </details>
          )}
          <button
            type="button"
            onClick={() => {
              try {
                this.props.recoverFromError?.();
              } catch (recoverError) {
                console.error('[AllModelAI] Route error recovery failed', recoverError);
              }
              this.setState((current) => ({
                error: null,
                componentStack: '',
                recoveryKey: current.recoveryKey + 1,
              }));
              this.props.onRetry?.();
            }}
          >
            Try again
          </button>
        </main>
      );
    }
    const { recoveryKey } = this.state;
    return <Fragment key={recoveryKey}>{this.props.children}</Fragment>;
  }
}
