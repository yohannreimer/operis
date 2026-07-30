# Clerk Production CSP Alignment

## Context

The Operis API already uses the production Clerk secret key from the Prymeira
Account application. The active backend key and the Clerk production instance
both resolve to `ins_3G2kfj7msAn24ExaxLYPlfAgegU`.

The Operis frontend was rebuilt with the matching production publishable key.
After deployment, the browser loaded the new bundle but blocked Clerk's runtime
from `https://clerk.prymeiradigital.com.br` because the Nginx Content Security
Policy only permits the former development Frontend API domain.

The Hub and every other application are explicitly out of scope and must not be
changed.

## Chosen approach

Add `https://clerk.prymeiradigital.com.br` to the existing `script-src`
directive while retaining the current development Clerk domain. This is the
smallest safe change: production can load its Clerk runtime, and local or
development builds that still use the development instance remain functional.

Replacing the development domain would make the policy stricter but would break
those builds. Generating the CSP dynamically at container startup would add
unnecessary configuration and deployment complexity.

## Files and behavior

- Update `ops/nginx-web.conf` so `script-src` permits both the production and
  development Clerk Frontend API domains.
- Update `apps/web/src/security-headers.test.ts` to require the production
  domain and preserve the existing security directives.
- Do not change authentication middleware, Clerk secrets, Portainer environment
  variables, the Hub, or any other application.

## Verification

1. Add the failing CSP assertion before changing Nginx.
2. Run the focused security-header test and the relevant web test suite.
3. Build the production frontend image.
4. Commit and push only the Operis CSP and test changes.
5. Wait for the Docker image workflow to succeed.
6. Pull and redeploy only the `operis` Portainer stack.
7. Confirm every Operis service is `1/1`.
8. Reload Operis and confirm:
   - the production Clerk runtime loads from
     `https://clerk.prymeiradigital.com.br`;
   - no Clerk CSP or development-key warning is emitted;
   - the authenticated workspace request no longer returns `401`;
   - the application finishes loading normally.

## Rollback

If the production runtime fails after deployment, revert this Operis commit and
redeploy the previous image. No Hub rollback is necessary because the Hub is not
part of this change.
