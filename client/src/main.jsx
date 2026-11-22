import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { ToastProvider } from './components/ui.jsx';
import { BrandingProvider } from './components/Branding.jsx';

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 15000, retry: (n, e) => n < 1 && !(e?.status >= 400 && e?.status < 500), refetchOnWindowFocus: true } },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={qc}>
        <BrandingProvider>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </BrandingProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
