import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { Toaster } from 'sonner';

import { App } from './App';
import './styles.css';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error('VITE_CLERK_PUBLISHABLE_KEY não definida.');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} signInUrl="/sign-in" afterSignOutUrl="/sign-in">
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
