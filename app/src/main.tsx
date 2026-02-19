import './i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ReactFlowProvider } from 'reactflow';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/index.css';
import 'reactflow/dist/style.css';
import '@reactflow/node-resizer/dist/style.css';

// Глобальный обработчик неперехваченных ошибок
window.addEventListener('error', (event) => {
  const fallbackMessage =
    event.message ||
    (event.error instanceof Error ? event.error.message : null) ||
    `Unhandled error at ${event.filename ?? 'unknown source'}:${event.lineno ?? '?'}:${event.colno ?? '?'}`;

  if (
    fallbackMessage?.includes('ResizeObserver loop limit exceeded') ||
    fallbackMessage?.includes('ResizeObserver loop completed with undelivered notifications')
  ) {
    // Игнорируем известное предупреждение браузера, не влияющее на работу приложения
    return;
  }

  console.error('Unhandled error:', event.error ?? fallbackMessage);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  // Предотвращаем показ ошибки в консоли браузера
  event.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ReactFlowProvider>
        <App />
      </ReactFlowProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
