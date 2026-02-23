import { Component, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="text-center font-mono">
            <p className="text-lg font-bold text-red-500">Something went wrong</p>
            <p className="mt-2 text-sm text-theme-text/60">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 rounded bg-accent px-4 py-2 text-sm text-white hover:opacity-90"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
