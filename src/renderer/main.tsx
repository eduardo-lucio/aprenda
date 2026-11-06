import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
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
      <App />
    </React.StrictMode>
  );
}
