import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import 'katex/dist/katex.min.css';
import './fonts.css';
import './index.css';

if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) {
  const { installMockApi } = await import('./dev/mockApi');
  installMockApi();
}

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
