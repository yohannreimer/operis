# Operis Server-Side Product Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the browser-side Prymeira access preflight so authenticated users enter Operis directly, while the API remains the authority that checks Hub product access and redirects denied requests.

**Architecture:** `AuthSync` keeps the Clerk token getter registered for the HTTP client but no longer calls the Hub. `AuthenticatedApp` renders routes after Clerk authentication. Each protected API request still goes through `requireAuth`, which checks the Hub and returns a structured `403`; the existing HTTP client redirects that response to the Hub access page.

**Tech Stack:** React 18, Clerk React, TypeScript, Vitest, Fastify.

---

### Task 1: Lock the frontend authentication boundary with tests

**Files:**
- Create: `apps/web/src/components/auth-sync.test.tsx`
- Modify: `apps/web/src/api.test.ts`

- [ ] **Step 1: Write the failing `AuthSync` test**

Mock `@clerk/react` so `useAuth` returns a stable `getToken`, render `<AuthSync />`, and assert that `fetch` is not called. The test must call `view.unmount()` to confirm no redirect effect runs during cleanup.

- [ ] **Step 2: Write the failing protected-API redirect test**

Exercise the existing API request path with this mocked `403` response and assert that `window.location.assign` receives `accessUrl`:

```ts
{
  error: "Acesso não liberado pela Prymeira Account.",
  productAccessRequired: true,
  reason: "no_entitlement",
  accessUrl: "https://hub.prymeiradigital.com.br/acesso-negado?product_key=operis"
}
```

- [ ] **Step 3: Confirm the new frontend-boundary test fails**

Run `cd apps/web && npm test -- src/components/auth-sync.test.tsx src/api.test.ts`. Expected: the `AuthSync` test fails because the current component fetches `/access-check`.

### Task 2: Remove the premature Operis preflight

**Files:**
- Modify: `apps/web/src/components/auth-sync.tsx`
- Modify: `apps/web/src/App.tsx`
- Delete: `apps/web/src/product-access.ts`
- Delete: `apps/web/src/product-access.test.ts`

- [ ] **Step 1: Simplify `AuthSync` to token registration only**

Replace the component implementation with:

```tsx
import { useEffect } from "react";
import { useAuth } from "@clerk/react";
import { setAuthTokenGetter } from "../api";

export function AuthSync() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  return null;
}
```

- [ ] **Step 2: Render protected routes after Clerk authentication**

Remove `useCallback` and `useState`, delete `ProductAccessFallback`, and replace `AuthenticatedApp` with:

```tsx
function AuthenticatedApp() {
  return (
    <>
      <AuthSync />
      <ProtectedRoutes />
    </>
  );
}
```

- [ ] **Step 3: Delete the obsolete settlement helper**

Delete the settlement helper and its unit tests. Verify no source file imports `resolveProductAccess`.

- [ ] **Step 4: Run the focused frontend tests**

Run `cd apps/web && npm test -- src/components/auth-sync.test.tsx src/api.test.ts`. Expected: both the no-Hub-fetch and backend-`403` redirect checks pass.

### Task 3: Verify the retained server-side authorization contract

**Files:**
- Test: `apps/api/src/middleware/auth.test.ts` or existing middleware coverage
- Verify: `apps/api/src/middleware/auth.ts`
- Verify: `apps/web/src/api.ts`

- [ ] **Step 1: Add denied-access middleware coverage**

Mock `checkPrymeiraProductAccess` to return `{ allowed: false, reason: "no_entitlement", accessUrl: "https://hub.prymeiradigital.com.br/acesso-negado?product_key=operis&reason=no_entitlement" }`. Invoke `requireAuth` with a valid mocked Clerk token and assert a `403` body contains `productAccessRequired: true` and `reason: "no_entitlement"`.

- [ ] **Step 2: Run the focused API authorization test**

Run the exact API test file from Step 1. Expected: denied product access returns `403`, and no denied request reaches a protected handler.

- [ ] **Step 3: Run project checks and record blockers accurately**

Run `npm test --workspace @execution-os/web -- --runInBand`, `npm run build --workspace @execution-os/web`, `npm test --workspace @execution-os/api`, and `git diff --check`. If existing corrupted dependencies block a command, record the exact command and error without treating it as a pass.

- [ ] **Step 4: Commit the implementation**

Stage only the changed authentication files, tests, deleted settlement files, and this plan. Do not stage the existing generated change at `apps/web/tsconfig.tsbuildinfo`. Commit with `git commit -m "fix: validate Operis product access through API"`.
