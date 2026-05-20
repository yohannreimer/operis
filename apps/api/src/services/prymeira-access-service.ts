import { env } from '../config.js';

type AccessCheckResponse = {
  allowed?: boolean;
  reason?: string;
};

export type PrymeiraAccessResult =
  | { allowed: true }
  | { allowed: false; reason: string; accessUrl: string };

function productAccessDeniedUrl(reason: string) {
  const hubUrl = env.PRYMEIRA_ACCOUNT_API_URL.replace(/\/api\/?$/, '');
  const params = new URLSearchParams({
    product_key: env.PRYMEIRA_PRODUCT_KEY,
    reason
  });

  return `${hubUrl}/acesso-negado?${params.toString()}`;
}

export async function checkPrymeiraProductAccess(token: string): Promise<PrymeiraAccessResult> {
  if (!env.PRYMEIRA_ACCESS_CHECK_ENABLED || env.NODE_ENV === 'test') {
    return { allowed: true };
  }

  const url = new URL(`${env.PRYMEIRA_ACCOUNT_API_URL.replace(/\/$/, '')}/access-check`);
  url.searchParams.set('product_key', env.PRYMEIRA_PRODUCT_KEY);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const payload = (await response.json().catch(() => ({}))) as AccessCheckResponse;

  if (response.ok && payload.allowed === true) {
    return { allowed: true };
  }

  const reason = payload.reason || 'no_entitlement';

  return {
    allowed: false,
    reason,
    accessUrl: productAccessDeniedUrl(reason)
  };
}
