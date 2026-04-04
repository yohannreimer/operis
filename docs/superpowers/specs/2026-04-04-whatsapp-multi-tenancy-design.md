# WhatsApp Multi-Tenancy Design

## Goal

Allow multiple users to connect their own WhatsApp number to their Operis account, with fully isolated data per user. Each user registers their phone number via the web app; the bot resolves `clerkUserId` from `phoneNumber` on every inbound message.

## Context

Currently the system is hard-wired for a single user:
- `DEFAULT_PHONE_NUMBER` and `WHATSAPP_CLERK_USER_ID` env vars identify the one user
- All service queries pass `'legacy'` as `clerkUserId`
- `WhatsappConversationSession` has no `clerkUserId` field
- Auto-dispatch sends to a single fixed phone number

## Architecture

### Phone Number Canonical Format

The canonical format throughout the system is **digit-only** (no `+` prefix), e.g. `5511999999999`. This matches what `normalizePhone()` in `webhooks.ts` already produces from inbound webhook payloads. `UserPhone.phoneNumber` stores this digit-only form. The web UI strips non-digit characters before sending to the API; the backend re-normalizes as a safety measure.

### Phone-User Mapping

New Prisma model:

```prisma
model UserPhone {
  id          String   @id @default(uuid())
  phoneNumber String   @unique
  clerkUserId String   @unique
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

- `phoneNumber` is unique — one number belongs to exactly one user; digit-only format
- `clerkUserId` is unique — one user can have at most one linked phone number
- `uuid()` for `id`, consistent with the rest of the schema
- No FK to a User model (Clerk manages user identity, not Prisma)
- Both columns are indexed via their `@unique` constraints

### `UserPhoneService`

New file: `apps/api/src/services/user-phone-service.ts`

```ts
class UserPhoneService {
  // Returns clerkUserId for a phoneNumber, or null if not registered.
  async findUserByPhone(phoneNumber: string): Promise<string | null>

  // Links a phone number to a user.
  // If the user already has a different number, it is replaced (upsert by clerkUserId).
  // Throws ConflictError if the phoneNumber already belongs to a different clerkUserId.
  async linkPhone(clerkUserId: string, phoneNumber: string): Promise<void>

  // Removes the phone link for a user. Idempotent — silently succeeds if no link exists.
  // Also deletes the WhatsappConversationSession for that phoneNumber if one exists.
  async unlinkPhone(clerkUserId: string): Promise<void>
}
```

**`ConflictError`:** a typed error class (e.g. `class ConflictError extends Error`) thrown by `linkPhone` when the phone number is already claimed by a different user. The route handler catches it and returns `409`.

**`linkPhone` semantics:** upsert by `clerkUserId`. A user can change their number by calling `linkPhone` directly with the new number — no need to unlink first. The old `UserPhone` row is replaced. However, if the new number is already owned by a *different* user, `ConflictError` is thrown before any change is made.

**`unlinkPhone` side effects:**
- Idempotent: if the user has no linked phone, it silently returns without error.
- Deletes the `WhatsappConversationSession` row for that `phoneNumber` to avoid orphaned sessions.
- Messages already enqueued in RabbitMQ for that number will still be delivered — acceptable since the user initiated the unlink and messages were already sent by Evolution API.

**Known race condition:** if `handleInbound` is processing a message for a `phoneNumber` while `unlinkPhone` is called concurrently (user clicks "Desvincular" mid-session), the in-flight handler will continue writing to DB tables (tasks, events) under the just-disassociated `clerkUserId`. This is acceptable at current scale and is explicitly out of scope.

**`unlinkPhone` and data retention:** unlinking does not delete the user's tasks, habits, or other data. It only removes the phone-to-user mapping and the active session. If the user re-links the same number later, all their data is still present.

### Inbound Message Flow

Lookup happens once, in the route handler / Fastify plugin — before `handleInbound`:

```
inbound webhook
  → normalize phoneNumber (digit-only, existing normalizePhone())
  → UserPhoneService.findUserByPhone(phoneNumber)
  → null  → return 200, no reply (silent ignore)
  → found → handleInbound(message, phoneNumber, clerkUserId)
```

`handleInbound` receives `clerkUserId` as an explicit parameter. `WhatsappConversationSession` gains a `clerkUserId: String?` field (nullable for migration safety on existing rows). The unique constraint remains on `phoneNumber`; `clerkUserId` is not unique on sessions since sessions are keyed by phone.

**Session `clerkUserId = NULL` during transition:** when sub-project 2 is deployed, existing active sessions may have `clerkUserId = NULL`. On the next inbound message, the route handler resolves `clerkUserId` from `UserPhone` and passes it to `handleInbound`. If an existing session is found with `NULL`, the handler updates the session's `clerkUserId` to the resolved value before continuing. This backfill-on-read approach avoids a complex migration.

The session stores `clerkUserId` as a denormalization for performance: avoiding a second DB lookup on every message within an active session is worth the minor redundancy.

All service calls inside `handleInbound` receive `clerkUserId` from this resolved value — no more `'legacy'` hardcoding.

**Files with hardcoded `'legacy'` to fix in sub-project 2:**
- `whatsapp-command-service.ts` (lines ~340, ~407, ~560)
- `whatsapp-proactivity-engine.ts` (line ~486)
- `whatsapp-conversation-service.ts` (any remaining internal fallbacks)
- `whatsapp-briefing-service.ts` (if any)

### Auto-Dispatch Fan-Out

`WhatsappAutoDispatchService.tick()` is refactored from single-user to fan-out:

```
tick()
  → prisma.userPhone.findMany()
  → for each { phoneNumber, clerkUserId }:
      → morning briefing (with clerkUserId, sends to phoneNumber)
      → evening habit check-in (with clerkUserId, sends to phoneNumber)
      → proactivity engine (with clerkUserId, sends to phoneNumber)
      → upcoming block digest (with clerkUserId, sends to phoneNumber)
```

**`sentKeys` namespacing:** keys are namespaced per user — `morning:{dateKey}:{clerkUserId}`, `habit_checkin:{dateKey}:{clerkUserId}`, etc.

**Known limitation:** `sentKeys` is an in-memory `Set` and does not survive process restarts. On restart, all users receive their next scheduled message again. This is an existing limitation and is explicitly out of scope.

**Manual dispatch webhook routes** (`/dispatch/morning`, `/dispatch/due-dates`, `/dispatch/followups`, `/dispatch/upcoming-blocks`): as part of sub-project 3, these routes fan-out to **all** registered `UserPhone` records (same behavior as `tick()`). The `to` query param is ignored.

**`DEFAULT_PHONE_NUMBER` and `WHATSAPP_CLERK_USER_ID`** env vars are removed from `config.ts` only after sub-project 3 is fully deployed and the data migration seed has run.

### Web UI — Phone Settings

Page (or settings tab): `/settings`

**States:**
- **Not linked:** input field for phone number + "Vincular" button
- **Linked:** displays current number + "Desvincular" button

**Number normalization:** frontend strips all non-digit characters before sending; backend re-normalizes to digit-only as a safety measure before saving.

**API endpoints** (protected by existing Clerk auth middleware):

```
GET    /api/user/phone   → 200 { phoneNumber: string | null }   (always 200, null if not linked)
POST   /api/user/phone   → body: { phoneNumber: string } → 200 | 409
DELETE /api/user/phone   → 200   (idempotent)
```

`clerkUserId` is extracted from the JWT — never passed as a URL parameter.

**Conflict:** `POST` returns `409 Conflict` with `{ error: "Número já cadastrado por outro usuário" }` if `ConflictError` is thrown by the service.

**Verification:** no OTP/confirmation step. A user can claim a phone number that is not theirs and will receive messages intended for the real owner. This is acceptable: Operis is an internal productivity tool where users are known and trusted, not a public-facing service.

**Rate limiting:** the `POST /api/user/phone` endpoint can be probed to enumerate registered numbers via `409` responses. No explicit rate limiting is added — acceptable for an internal tool at current scale.

## Scope

This design covers three independent sub-projects, to be implemented in order:

1. **Phone-User Linking** — `UserPhone` migration + `UserPhoneService` + API endpoints + web UI settings page
2. **WhatsApp bot multi-user** — inbound lookup + `clerkUserId` threading through `handleInbound` + `WhatsappConversationSession` migration + remove all `'legacy'` hardcoding
3. **Auto-dispatch multi-user** — fan-out in `tick()`, update manual dispatch routes, namespaced `sentKeys`, remove `DEFAULT_PHONE_NUMBER` and `WHATSAPP_CLERK_USER_ID` env vars

Each sub-project produces working, independently testable software.

## Out of Scope

- Per-user timezone or schedule configuration (all users share server timezone/env vars)
- OTP verification when linking phone number
- Bot response to unregistered numbers (silent ignore)
- Multi-instance Evolution API (one instance serves all users)
- Persisting `sentKeys` across restarts
- `WhatsappEvent` multi-tenancy scoping (all events are already task-scoped; cross-user collision is not a practical risk given task isolation)
- Unlink-during-active-session race condition handling
- Rate limiting on phone linking endpoint

## Migration

**Sub-project 1 — `UserPhone` table:**

Prisma migration creates the `UserPhone` table. A Prisma seed script (not raw SQL) inserts the existing user's record so the current production user keeps working:

```ts
// prisma/seed.ts (or equivalent)
await prisma.userPhone.upsert({
  where: { phoneNumber: process.env.DEFAULT_PHONE_NUMBER! },
  update: {},
  create: {
    phoneNumber: process.env.DEFAULT_PHONE_NUMBER!,
    clerkUserId: process.env.WHATSAPP_CLERK_USER_ID!,
  },
});
```

`DEFAULT_PHONE_NUMBER` and `WHATSAPP_CLERK_USER_ID` must still be present in the environment at migration time. They are removed from `config.ts` only after sub-project 3 is fully deployed.

**Rollback sub-project 1:** drop the `UserPhone` table. Safe at any point before sub-project 2 is deployed.

**Sub-project 2 — `WhatsappConversationSession.clerkUserId`:**

Prisma migration adds nullable `clerkUserId String?` column to `WhatsappConversationSession`. No backfill required — NULL rows are handled on first inbound message via the backfill-on-read approach described above. Active sessions at deploy time will have NULL; they will be populated on the next message from that user.

**Rollback sub-project 2:** drop the `clerkUserId` column from `WhatsappConversationSession` and revert the code changes. Safe as long as no logic depends on the column being present.

**Sub-project 3 — remove env vars:**

No schema changes. Remove `DEFAULT_PHONE_NUMBER` and `WHATSAPP_CLERK_USER_ID` from `config.ts` and all service code. Rollback requires re-adding them and re-deploying.

**Ordering constraint:** sub-project 1 must be deployed before sub-project 2, and sub-project 2 before sub-project 3.
