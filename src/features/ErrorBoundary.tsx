import { Component, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (this.state.error)
      return (
        <div className="card mx-auto mt-10 max-w-lg text-center">
          <p className="font-semibold">Kutilmagan xato yuz berdi</p>
          <p className="mt-2 text-sm text-muted">Ma’lumotlaringiz qurilmada saqlangan. Sahifani yangilab ko‘ring.</p>
          <pre className="mt-3 overflow-auto rounded bg-surface2 p-2 text-left text-xs text-muted">{this.state.error.message}</pre>
          <button className="btn-primary mt-4" onClick={() => location.reload()}>
            Yangilash
          </button>
        </div>
      );
    return this.props.children;
  }
}
