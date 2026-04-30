import type { ReactNode } from 'react';
import { Component } from 'react';

type Props = { children: ReactNode };
type State = { error?: Error };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          <h2 style={{ fontWeight: 700, marginBottom: 8 }}>Frontend crashed</h2>
          <p style={{ marginBottom: 8 }}>
            Open the browser console for the full stacktrace. Error:
          </p>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error?.message ?? this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

