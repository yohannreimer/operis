import { useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { productAccessDeniedUrl, redirectToProductAccessPage, setAuthTokenGetter } from '../api';
import { resolveProductAccess } from '../product-access';

const PRYMEIRA_ACCOUNT_API_URL = (
  import.meta.env.VITE_PRYMEIRA_ACCOUNT_API_URL ?? 'https://hub.prymeiradigital.com.br/api'
).replace(/\/$/, '');
const PRYMEIRA_PRODUCT_KEY = import.meta.env.VITE_PRYMEIRA_PRODUCT_KEY ?? 'operis';

/**
 * Registers the Clerk token getter into the API client.
 * Must be rendered inside <ClerkProvider> and <SignedIn>.
 */
type AuthSyncProps = {
  onProductAccessVerified: () => void;
};

export function AuthSync({ onProductAccessVerified }: AuthSyncProps) {
  const { getToken, isLoaded } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded) return;

    let cancelled = false;

    async function checkProductAccess() {
      const access = await resolveProductAccess({
        getToken,
        request: (token) =>
          fetch(
            `${PRYMEIRA_ACCOUNT_API_URL}/access-check?product_key=${encodeURIComponent(PRYMEIRA_PRODUCT_KEY)}`,
            {
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          )
      });

      if (cancelled) return;

      if (access === 'denied') {
        redirectToProductAccessPage('no_entitlement', productAccessDeniedUrl('no_entitlement'));
        return;
      }

      // Backend routes still enforce access. Do not block the product on transient network failures.
      onProductAccessVerified();
    }

    void checkProductAccess();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, onProductAccessVerified]);

  return null;
}
