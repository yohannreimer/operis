// src/demo/mock-clerk.tsx
// Fake Clerk module — used when VITE_DEMO_MODE=true
// Vite aliases @clerk/react to this file so the app loads without a real key.

import type { ReactNode } from 'react';

export function ClerkProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
export function ClerkLoading() { return null; }
export function ClerkLoaded({ children }: { children: ReactNode }) { return <>{children}</>; }
export function SignedIn({ children }: { children: ReactNode }) { return <>{children}</>; }
export function SignedOut() { return null; }
export function SignIn() { return <div>Sign In (demo)</div>; }

export function useAuth() {
  return {
    isLoaded: true,
    isSignedIn: true,
    userId: 'demo-user',
    getToken: async () => 'demo-token',
    signOut: async () => {},
  };
}

export function useUser() {
  return {
    isLoaded: true,
    isSignedIn: true,
    user: {
      id: 'demo-user',
      firstName: 'Demo',
      lastName: 'User',
      fullName: 'Demo User',
      emailAddresses: [{ emailAddress: 'demo@prymeira.com' }],
      primaryEmailAddress: { emailAddress: 'demo@prymeira.com' },
      imageUrl: '',
    },
  };
}

export function useClerk() {
  return { signOut: async () => {} };
}
