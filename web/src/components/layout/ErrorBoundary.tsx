import { Component, type ErrorInfo, type ReactNode } from "react";
import { flush, log } from "../../logging";
import { useReportStore } from "../../store/useReportStore";

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The component stack is only available here, and is usually the fastest
    // route to the offending component.
    log("ui.react_error", {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    }, "fatal", { msg: error.message, src: "ErrorBoundary" });
    void flush();
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
            <button
              onClick={() =>
                useReportStore.getState().openReport(
                  this.state.error
                    ? `The UI crashed: ${this.state.error.message}`
                    : "The UI crashed.",
                )
              }
              className="mt-2 rounded border border-theme-border px-4 py-2 text-sm text-theme-text hover:border-accent hover:text-accent"
            >
              Report this crash
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
