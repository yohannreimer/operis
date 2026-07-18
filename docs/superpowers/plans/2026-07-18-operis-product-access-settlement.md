# Operis Product Access Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a transient negative entitlement response from redirecting an eligible Operis user to the Prymeira Hub.

**Architecture:** Move retryable Hub access checking into a focused frontend utility. `AuthSync` will use it to defer protected routes until access resolves, while the existing API middleware continues to enforce entitlement server-side.

**Tech Stack:** React 18, TypeScript, Vitest.

---

### Task 1: Test retryable Hub access resolution

**Files:**

- Create: `apps/web/src/product-access.test.ts`
- Create: `apps/web/src/product-access.ts`

- [ ] **Step 1: Write failing tests for eventual permission settlement**

```ts
it('returns allowed when a later Hub attempt grants access', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ allowed: false }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ allowed: true }) });

  await expect(resolveProductAccess({ getToken, request, wait })).resolves.toBe('allowed');
  expect(request).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails because the utility does not exist**

Run: `npm run test --workspace @execution-os/web -- src/product-access.test.ts`

Expected: FAIL with a module or export error for `product-access`.

- [ ] **Step 3: Implement the retryable access utility**

```ts
export async function resolveProductAccess(input: ProductAccessCheckInput): Promise<ProductAccessState> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const token = await input.getToken();
    if (!token) return 'unavailable';
    try {
      const response = await input.request(token);
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.allowed === true) return 'allowed';
    } catch {
      return 'unavailable';
    }
    if (attempt < MAX_ATTEMPTS - 1) await input.wait(RETRY_DELAY_MS);
  }
  return 'denied';
}
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npm run test --workspace @execution-os/web -- src/product-access.test.ts`

Expected: PASS with all product-access tests green.

### Task 2: Gate protected routes until Hub access settles

**Files:**

- Modify: `apps/web/src/components/auth-sync.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Use the utility in `AuthSync`**

Pass a stable `onProductAccessVerified` callback. Redirect only after `resolveProductAccess` returns `denied`; call the callback for `allowed` and `unavailable` states.

- [ ] **Step 2: Prevent protected routes from mounting early**

Render `AuthSync` plus a small validation fallback until the callback confirms the access flow is resolved. Keep the protected routes unmounted during the retry window.

- [ ] **Step 3: Run the frontend test suite and production build**

Run: `npm run test --workspace @execution-os/web && npm run build --workspace @execution-os/web`

Expected: both commands exit with code 0.
