import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { Toaster } from 'sonner';

import { App } from './App';
import './styles.css';
import { installMockFetch } from './demo/mock-fetch';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!DEMO_MODE && !PUBLISHABLE_KEY) {
  throw new Error('VITE_CLERK_PUBLISHABLE_KEY não definida.');
}

if (DEMO_MODE) {
  installMockFetch();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY || 'demo'} signInUrl="/sign-in" afterSignOutUrl="/sign-in">
      <App />
      <Toaster
        theme="dark"
        richColors
        closeButton
        position="top-right"
        toastOptions={{
          duration: 2200
        }}
      />
    </ClerkProvider>
  </React.StrictMode>
);
