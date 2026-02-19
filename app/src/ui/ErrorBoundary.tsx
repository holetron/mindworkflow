import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error?: Error; onRetry?: () => void }>;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render shows fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return <FallbackComponent error={this.state.error} onRetry={this.handleRetry} />;
      }

      // Default fallback UI
      return (
        <div className="flex h-full items-center justify-center p-6">
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-6 text-center">
            <div className="mb-4 text-red-400">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-slate-100">Something went wrong</h3>
            <p className="mb-4 text-sm text-slate-400">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded bg-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-600"
                onClick={this.handleRetry}
              >
                Try Again
              </button>
              <button
                type="button"
                className="rounded bg-red-700 px-4 py-2 text-sm text-red-200 hover:bg-red-600"
                onClick={() => {
                  const errorMessage = this.state.error?.message || 'Unknown error';
                  const stack = this.state.error?.stack || '';
                  const errorDetails = `Error: ${errorMessage}\n\nStack: ${stack}`;
                  navigator.clipboard.writeText(errorDetails).then(() => {
                    alert('Error copied to clipboard. Send it to the developer.');
                  }).catch(() => {
                    alert(errorDetails);
                  });
                }}
              >
                Report error
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Simple fallback component for integrations
export function IntegrationErrorFallback({ error, onRetry }: { error?: Error; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-center">
      <h4 className="mb-2 text-sm font-semibold text-red-400">Integration loading error</h4>
      <p className="mb-3 text-xs text-slate-400">
        {error?.message || 'Failed to load integration settings'}
      </p>
      {onRetry && (
        <button
          type="button"
          className="rounded bg-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-600"
          onClick={onRetry}
        >
          Reload
        </button>
      )}
    </div>
  );
}

export default ErrorBoundary;