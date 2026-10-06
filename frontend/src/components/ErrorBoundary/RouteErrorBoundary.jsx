import { Component } from 'react';
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
    this.state = { error: null, componentStack: '' };
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
              this.setState({ error: null, componentStack: '' });
              this.props.onRetry?.();
            }}
          >
            Try again
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
