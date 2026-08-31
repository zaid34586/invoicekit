import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Catches any uncaught error thrown while rendering, so a bug in one part of
// the app shows a friendly recoverable screen instead of a blank white page.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="max-w-sm w-full text-center bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">⚠️</div>
            <h2 className="text-lg font-bold text-slate-900">Something went wrong</h2>
            <p className="text-sm text-slate-500 mt-2">
              This page hit an unexpected error. Reloading usually fixes it — your data is safe.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 w-full rounded-2xl bg-slate-950 text-white px-4 py-3 text-sm font-bold"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
