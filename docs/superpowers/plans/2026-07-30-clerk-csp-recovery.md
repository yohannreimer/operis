# Clerk CSP Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Clerk authentication while preserving a restrictive production Content Security Policy.

**Architecture:** Keep the CSP in the Nginx frontend boundary and add only Clerk's current Frontend API and protection hosts. Add a Vitest regression test that reads the production Nginx configuration and checks both required sources and forbidden broad script permissions.

**Tech Stack:** Nginx, React, Clerk, Vitest, TypeScript

---

### Task 1: Add the CSP regression test

**Files:**
- Create: `apps/web/src/security-headers.test.ts`
- Read: `ops/nginx-web.conf`

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const nginxConfigPath = resolve(process.cwd(), '../../ops/nginx-web.conf');
const nginxConfig = readFileSync(nginxConfigPath, 'utf8');
const csp = nginxConfig.match(/add_header Content-Security-Policy "([^"]+)"/)?.[1];

describe('production Content Security Policy', () => {
  it('allows the Clerk runtime and protection resources', () => {
    expect(csp).toBeDefined();
    expect(csp).toContain(
      "script-src 'self' https://discrete-peacock-45.clerk.accounts.dev https://challenges.cloudflare.com https://*.protect.clerk.com"
    );
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain(
      "frame-src 'self' https://challenges.cloudflare.com https://*.protect.clerk.com"
    );
  });

  it('does not allow arbitrary or inline scripts', () => {
    const scriptSources = csp
      ?.split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('script-src'));

    expect(scriptSources).not.toContain("'unsafe-inline'");
    expect(scriptSources).not.toContain("'unsafe-eval'");
    expect(scriptSources).not.toMatch(/(?:^|\s)https:(?:\s|$)/);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test --workspace @execution-os/web -- src/security-headers.test.ts`

Expected: one failed test because the current CSP has only `script-src 'self'` and lacks `worker-src` and `frame-src`.

### Task 2: Correct the production CSP

**Files:**
- Modify: `ops/nginx-web.conf`
- Test: `apps/web/src/security-headers.test.ts`

- [ ] **Step 1: Add the minimal Clerk sources**

Set the CSP header to:

```nginx
add_header Content-Security-Policy "default-src 'self'; connect-src 'self' https: wss:; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; font-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' https://discrete-peacock-45.clerk.accounts.dev https://challenges.cloudflare.com https://*.protect.clerk.com; worker-src 'self' blob:; frame-src 'self' https://challenges.cloudflare.com https://*.protect.clerk.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests" always;
```

- [ ] **Step 2: Run the focused test and verify it passes**

Run: `npm test --workspace @execution-os/web -- src/security-headers.test.ts`

Expected: two passing tests.

- [ ] **Step 3: Run the complete web test suite**

Run: `npm test --workspace @execution-os/web`

Expected: all web tests pass.

- [ ] **Step 4: Build the production frontend**

Run: `npm run build --workspace @execution-os/web`

Expected: TypeScript and Vite finish with exit code 0.

- [ ] **Step 5: Inspect the final diff**

Run: `git diff --check && git diff -- ops/nginx-web.conf apps/web/src/security-headers.test.ts`

Expected: no whitespace errors and only the approved CSP correction plus its regression test.
