"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

const ENDPOINT = "http://127.0.0.1:7544/ingest/d3bac746-7f30-4189-a378-b3d32ca27dd5";
const SESSION = "e53e3b";

function postDebug(payload: Record<string, unknown>) {
  // #region agent log
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": SESSION },
    body: JSON.stringify({
      sessionId: SESSION,
      timestamp: Date.now(),
      ...payload,
    }),
  }).catch(() => {});
  // #endregion
}

type Props = { children: ReactNode };
type State = { err: Error | null };

/** Catches client render errors so the page is not a blank white screen; logs to debug ingest. */
export class ClientErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    postDebug({
      hypothesisId: "H_client_react_error",
      location: "ClientErrorBoundary.componentDidCatch",
      message: err.message,
      data: {
        stack: err.stack?.slice(0, 1200),
        componentStack: info.componentStack?.slice(0, 1200),
      },
    });
  }

  render() {
    if (this.state.err) {
      return (
        <div className="min-h-screen bg-white p-6 text-red-800">
          <p className="text-lg font-semibold">Client error</p>
          <p className="mt-2 font-mono text-sm">{this.state.err.message}</p>
          <pre className="mt-4 max-h-[55vh] overflow-auto whitespace-pre-wrap rounded border border-red-200 bg-red-50 p-3 text-xs text-red-900">
            {this.state.err.stack ?? "(no stack)"}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
