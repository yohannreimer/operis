# Clerk Production CSP Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the Operis frontend to load the Prymeira Account production Clerk runtime and eliminate the authenticated workspace `401` without changing the Hub or any other application.

**Architecture:** Keep the existing static Nginx CSP and add the single production Clerk Frontend API origin to `script-src`. Lock the allowed origins with a focused Vitest contract test, then publish and redeploy only the Operis stack before validating the browser and API path.

**Tech Stack:** Nginx, Content Security Policy, Vitest, Vite, GitHub Actions, GHCR, Docker Swarm, Portainer, Clerk

---

### Task 1: Add a failing production Clerk CSP contract

**Files:**
- Modify: `apps/web/src/security-headers.test.ts`
- Test: `apps/web/src/security-headers.test.ts`

- [ ] **Step 1: Extend the Clerk runtime assertion**

Replace the current `script-src` expectation with:

```ts
expect(csp).toContain(
  "script-src 'self' https://clerk.prymeiradigital.com.br https://discrete-peacock-45.clerk.accounts.dev https://challenges.cloudflare.com https://*.protect.clerk.com"
);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm run test --workspace @execution-os/web -- src/security-headers.test.ts
```

Expected: one failed test because `ops/nginx-web.conf` does not yet contain
`https://clerk.prymeiradigital.com.br` in `script-src`.

### Task 2: Permit the production Clerk runtime

**Files:**
- Modify: `ops/nginx-web.conf`
- Test: `apps/web/src/security-headers.test.ts`

- [ ] **Step 1: Add the production Frontend API origin**

Change the CSP header to:

```nginx
add_header Content-Security-Policy "default-src 'self'; connect-src 'self' https: wss:; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; font-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' https://clerk.prymeiradigital.com.br https://discrete-peacock-45.clerk.accounts.dev https://challenges.cloudflare.com https://*.protect.clerk.com; worker-src 'self' blob:; frame-src 'self' https://challenges.cloudflare.com https://*.protect.clerk.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests" always;
```

- [ ] **Step 2: Run the focused test and verify it passes**

Run:

```bash
npm run test --workspace @execution-os/web -- src/security-headers.test.ts
```

Expected: `apps/web/src/security-headers.test.ts` passes.

- [ ] **Step 3: Run the complete web test suite**

Run:

```bash
npm run test --workspace @execution-os/web
```

Expected: all web tests pass.

- [ ] **Step 4: Build the web application**

Run:

```bash
npm run build --workspace @execution-os/web
```

Expected: TypeScript and Vite complete successfully.

- [ ] **Step 5: Check the exact diff**

Run:

```bash
git diff --check -- apps/web/src/security-headers.test.ts ops/nginx-web.conf
git diff -- apps/web/src/security-headers.test.ts ops/nginx-web.conf
```

Expected: only the production Clerk origin is added to the CSP contract and
Nginx policy. The existing user-owned `apps/web/tsconfig.tsbuildinfo` change is
not staged.

- [ ] **Step 6: Commit the implementation**

Run:

```bash
git add -- apps/web/src/security-headers.test.ts ops/nginx-web.conf
git commit -m "fix: allow production Clerk runtime"
```

Expected: a commit containing exactly the two CSP files.

### Task 3: Publish and deploy only Operis

**Files:**
- No additional file changes.

- [ ] **Step 1: Push the approved Operis commits**

Run:

```bash
git push origin main
```

Expected: the design commit and CSP implementation commit reach
`yohannreimer/operis` on `main`, triggering `Publish Docker Images`.

- [ ] **Step 2: Identify and monitor the triggered workflow**

Run:

```bash
gh run list --repo yohannreimer/operis --workflow docker-publish.yml --limit 1
gh run watch --repo yohannreimer/operis --exit-status
```

Expected: the workflow completes with `success`, including the
`pluris-frontend` build and push.

- [ ] **Step 3: Redeploy the Operis stack in Portainer**

In the authenticated Portainer tab:

1. Open environment `primary`.
2. Open **Stacks → operis**.
3. Click **Pull and redeploy**.
4. Confirm with **Update**.

Expected: only the `operis` stack is redeployed. Do not open, edit, or redeploy
the Hub or any other stack.

- [ ] **Step 4: Verify Swarm replicas**

Refresh the Operis stack details and confirm:

```text
operis_pluris_api       1 / 1
operis_pluris_frontend  1 / 1
operis_pluris_postgres  1 / 1
operis_pluris_rabbitmq  1 / 1
operis_pluris_worker    1 / 1
```

Expected: all five services are healthy at `1/1`.

### Task 4: Validate the production authentication path

**Files:**
- No file changes.

- [ ] **Step 1: Reload the authenticated Operis tab**

Reload `https://operis.prymeiradigital.com.br/inbox` after the redeploy.

Expected: the application leaves `Carregando...` and renders the authenticated
interface.

- [ ] **Step 2: Verify the active frontend and Clerk runtime**

Inspect the page script URL and browser logs.

Expected:

```text
Clerk runtime origin: https://clerk.prymeiradigital.com.br
Development-key warning: absent
failed_to_load_clerk_js: absent
CSP violation for clerk.prymeiradigital.com.br: absent
```

- [ ] **Step 3: Verify the authenticated API response**

Observe the authenticated `/api/workspaces` request generated by the application
or issue the same read-only request using the active Clerk session token.

Expected:

```text
HTTP status: 200
Response must not contain: Token inválido ou expirado.
```

- [ ] **Step 4: Record final repository state**

Run:

```bash
git status --short
git log -3 --oneline
```

Expected: only the pre-existing user-owned
`apps/web/tsconfig.tsbuildinfo` modification remains uncommitted; the design and
CSP implementation commits are present.
