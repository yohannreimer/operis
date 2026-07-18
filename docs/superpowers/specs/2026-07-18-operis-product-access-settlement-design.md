# Operis Product Access Settlement Design

## Goal

Avoid sending a newly authenticated, entitled user to the Prymeira Hub while its entitlement is still being synchronized.

## Chosen approach

The frontend will not mount protected Operis routes until the Hub returns `allowed: true`. It will retry a temporary negative result four times, 750 ms apart, before redirecting to the Hub. A network failure remains non-blocking, matching the current behavior: the backend remains responsible for protecting every API endpoint.

## Why this approach

The Hub is the authority for product entitlement. Its response can become positive immediately after the first negative response during login settlement. The existing frontend redirects on that first negative response. Waiting only at the frontend prevents premature protected-route API calls and preserves the backend's deny-by-default enforcement.

## Data flow

1. Clerk reports a signed-in user.
2. `AuthSync` registers the Clerk token getter and asks the Hub for product access.
3. A positive result opens the protected route tree.
4. A negative result is retried up to four total attempts.
5. A final negative result redirects to the Hub's access-denied page.
6. A network failure opens the route tree; subsequent API calls still require a valid Clerk token and entitlement at the backend.

## Testing

Unit tests will prove that a negative result followed by an allowed result does not redirect, that a sustained denial redirects only after the final attempt, and that a transport failure does not redirect.
