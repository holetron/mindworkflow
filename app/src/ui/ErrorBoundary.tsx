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
    // Обновляем состояние, чтобы следующий рендер показал fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Логируем ошибку для отладки
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

      // Стандартный fallback UI
      return (
        <div className="flex h-full items-center justify-center p-6">
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-6 text-center">
            <div className="mb-4 text-red-400">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-slate-100">Что-то пошло не так</h3>
            <p className="mb-4 text-sm text-slate-400">
              {this.state.error?.message || 'Произошла неожиданная ошибка'}
            </p>
            <button
              type="button"
              className="rounded bg-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-600"
              onClick={this.handleRetry}
            >
              Попробовать снова
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Простой компонент fallback для интеграций
export function IntegrationErrorFallback({ error, onRetry }: { error?: Error; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-center">
      <h4 className="mb-2 text-sm font-semibold text-red-400">Ошибка загрузки интеграций</h4>
      <p className="mb-3 text-xs text-slate-400">
        {error?.message || 'Не удалось загрузить настройки интеграций'}
      </p>
      {onRetry && (
        <button
          type="button"
          className="rounded bg-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-600"
          onClick={onRetry}
        >
          Перезагрузить
        </button>
      )}
    </div>
  );
}

export default ErrorBoundary;