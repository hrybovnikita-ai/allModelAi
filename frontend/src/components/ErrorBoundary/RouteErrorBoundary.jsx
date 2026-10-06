import { Component } from 'react';

export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[AllModelAI] Route render error', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <main className="dashboard-page auth-recovery-panel" role="alert">
          <h1>Something went wrong</h1>
          <p>{error?.message || 'This page could not be loaded.'}</p>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null });
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
