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
  console.error('Unhandled error:', event.error);
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
