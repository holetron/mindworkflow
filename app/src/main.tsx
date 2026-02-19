import './i18n';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ReactFlowProvider } from 'reactflow';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/index.css';
import 'reactflow/dist/style.css';
import '@reactflow/node-resizer/dist/style.css';

// Global handler for uncaught errors
window.addEventListener('error', (event) => {
  const fallbackMessage =
    event.message ||
    (event.error instanceof Error ? event.error.message : null) ||
    `Unhandled error at ${event.filename ?? 'unknown source'}:${event.lineno ?? '?'}:${event.colno ?? '?'}`;

  if (
    fallbackMessage?.includes('ResizeObserver loop limit exceeded') ||
    fallbackMessage?.includes('ResizeObserver loop completed with undelivered notifications')
  ) {
    // Ignore a known browser warning that does not affect the application
    return;
  }

  console.error('Unhandled error:', event.error ?? fallbackMessage);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  // Prevent showing the error in the browser console
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
