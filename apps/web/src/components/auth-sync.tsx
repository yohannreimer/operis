import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { setAuthTokenGetter } from '../api';

/**
 * Registers the Clerk token getter into the API client.
 * Must be rendered inside <ClerkProvider> and <SignedIn>.
 */
export function AuthSync() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  return null;
}
