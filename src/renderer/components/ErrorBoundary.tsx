import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Keep a failed render actionable without deleting any workspace data. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  override state: { error: string | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: string } {
    return { error: error.message || 'Unexpected interface error' };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Joe Browser interface failed', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="recovery" role="alert">
        <div className="brand-mark lg">J</div>
        <h1>Joe Browser couldn’t display this screen</h1>
        <p>Your workspace files have not been removed. Reload to try again.</p>
        <pre>{this.state.error}</pre>
        <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>Reload application</button>
      </main>
    );
  }
}
