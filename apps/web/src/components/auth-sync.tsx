import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { productAccessDeniedUrl, redirectToProductAccessPage, setAuthTokenGetter } from '../api';

const PRYMEIRA_ACCOUNT_API_URL = (
  import.meta.env.VITE_PRYMEIRA_ACCOUNT_API_URL ?? 'https://hub.prymeiradigital.com.br/api'
).replace(/\/$/, '');
const PRYMEIRA_PRODUCT_KEY = import.meta.env.VITE_PRYMEIRA_PRODUCT_KEY ?? 'operis';

/**
 * Registers the Clerk token getter into the API client.
 * Must be rendered inside <ClerkProvider> and <SignedIn>.
 */
export function AuthSync() {
  const { getToken, isLoaded } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded) return;

    let cancelled = false;

    async function checkProductAccess() {
      try {
        const token = await getToken();
        if (!token) return;

        const response = await fetch(
          `${PRYMEIRA_ACCOUNT_API_URL}/access-check?product_key=${encodeURIComponent(PRYMEIRA_PRODUCT_KEY)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        const payload = await response.json().catch(() => ({} as Record<string, unknown>));
        const allowed = payload.allowed === true;

        if (!cancelled && (!response.ok || !allowed)) {
          const reason = typeof payload.reason === 'string' ? payload.reason : 'no_entitlement';
          redirectToProductAccessPage(reason, productAccessDeniedUrl(reason));
        }
      } catch {
        // Backend routes still enforce access. Avoid redirecting on transient network/CORS failures.
      }
    }

    void checkProductAccess();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded]);

  return null;
}
