const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_RETRY_DELAY_MS = 750;

export type ProductAccessState = 'allowed' | 'denied' | 'unavailable';

type ProductAccessResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

export type ProductAccessCheckInput = {
  getToken: () => Promise<string | null>;
  request: (token: string) => Promise<ProductAccessResponse>;
  wait?: (delayMs: number) => Promise<void>;
  maxAttempts?: number;
  retryDelayMs?: number;
};

function delay(delayMs: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
}

function isAllowed(payload: unknown) {
  return typeof payload === 'object' && payload !== null && (payload as { allowed?: unknown }).allowed === true;
}

/**
 * The Hub can briefly report no entitlement while it settles a just-created session.
 * A final denial remains fail-closed; transport errors are left to the protected API.
 */
export async function resolveProductAccess({
  getToken,
  request,
  wait = delay,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS
}: ProductAccessCheckInput): Promise<ProductAccessState> {
  const attempts = Math.max(1, maxAttempts);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const token = await getToken();
      if (!token) return 'unavailable';

      const response = await request(token);
      const payload = await response.json().catch(() => undefined);
      if (response.ok && isAllowed(payload)) return 'allowed';
    } catch {
      return 'unavailable';
    }

    if (attempt < attempts - 1) {
      await wait(retryDelayMs);
    }
  }

  return 'denied';
}
