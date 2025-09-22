import React from 'react';
import ReactDOM from 'react-dom/client';
import { ReactFlowProvider } from 'reactflow';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/index.css';
import 'reactflow/dist/style.css';
import '@reactflow/node-resizer/dist/style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ReactFlowProvider>
        <App />
      </ReactFlowProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
