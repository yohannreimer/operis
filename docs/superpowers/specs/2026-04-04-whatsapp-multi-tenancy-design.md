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

### Phone-User Mapping

New Prisma model:

```prisma
model UserPhone {
  id          String   @id @default(cuid())
  phoneNumber String   @unique
  clerkUserId String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

- `phoneNumber` is unique — one number belongs to exactly one user
- `clerkUserId` is the Clerk JWT `sub` claim, consistent with all existing service queries
- No FK to a User model (Clerk manages user identity, not Prisma)
- Upsert by `phoneNumber` — allows a user to correct their number or re-link

### `UserPhoneService`

New file: `apps/api/src/services/user-phone-service.ts`

```ts
class UserPhoneService {
  async findUserByPhone(phoneNumber: string): Promise<string | null>
  async linkPhone(clerkUserId: string, phoneNumber: string): Promise<void>
  async unlinkPhone(clerkUserId: string): Promise<void>
}
```

- `findUserByPhone` — single indexed lookup, returns `clerkUserId` or `null`
- `linkPhone` — upserts the record; validates uniqueness, returns `409` if phone belongs to another user
- `unlinkPhone` — deletes by `clerkUserId`

### Inbound Message Flow

Lookup happens once, in the route handler / Fastify plugin — before `handleInbound`:

```
inbound webhook
  → normalize phoneNumber
  → UserPhoneService.findUserByPhone(phoneNumber)
  → null  → return 200, no reply (silent ignore)
  → found → handleInbound(message, phoneNumber, clerkUserId)
```

`handleInbound` receives `clerkUserId` as an explicit parameter. `WhatsappConversationSession` gains a `clerkUserId: string` field so all internal handlers have access without additional lookups.

All service calls inside `handleInbound` receive `clerkUserId` from this resolved value — no more `'legacy'` hardcoding.

### Auto-Dispatch Fan-Out

`WhatsappAutoDispatchService.tick()` is refactored from single-user to fan-out:

```
tick()
  → prisma.userPhone.findMany()
  → for each { phoneNumber, clerkUserId }:
      → morning briefing (with clerkUserId)
      → evening habit check-in (with clerkUserId)
      → proactivity engine (with clerkUserId)
      → upcoming block digest (with clerkUserId)
```

- `sentKeys` is namespaced per user: `morning:{dateKey}:{clerkUserId}`
- `enqueueMessage` sends to that user's `phoneNumber`
- `DEFAULT_PHONE_NUMBER` and `WHATSAPP_CLERK_USER_ID` env vars are deprecated and removed

### Web UI — Phone Settings

Page (or settings tab): `/settings`

**States:**
- **Not linked:** input field for phone number + "Vincular" button
- **Linked:** displays current number + "Desvincular" button

**Number normalization:** frontend accepts any common format; backend normalizes to E.164 (`+5511999999999`) before saving.

**API endpoints** (protected by existing Clerk auth middleware):

```
GET    /api/user/phone   → { phoneNumber: string | null }
POST   /api/user/phone   → body: { phoneNumber: string } → 200 | 409
DELETE /api/user/phone   → 200
```

`clerkUserId` is extracted from the JWT — never passed as a URL parameter.

**Conflict:** if `phoneNumber` already belongs to another user, `POST` returns `409 Conflict` with a human-readable error message. Frontend displays it inline.

**Verification:** no OTP/confirmation step — we trust the user entered their own number.

## Scope

This design covers three independent sub-projects, to be implemented in order:

1. **Phone-User Linking** — `UserPhone` model + `UserPhoneService` + API endpoints + web UI settings page
2. **WhatsApp bot multi-user** — inbound lookup + `clerkUserId` threading through `handleInbound` + remove all `'legacy'` hardcoding
3. **Auto-dispatch multi-user** — fan-out in `tick()`, namespaced `sentKeys`, deprecate `DEFAULT_PHONE_NUMBER` and `WHATSAPP_CLERK_USER_ID`

Each sub-project produces working, independently testable software.

## Out of Scope

- Per-user timezone or schedule configuration (all users share server timezone/env vars)
- OTP verification when linking phone number
- Bot response to unregistered numbers (silent ignore)
- Multi-instance Evolution API (one instance serves all users)

## Migration

Existing production data: add a seed or migration script that inserts a `UserPhone` record for the current `DEFAULT_PHONE_NUMBER` + `WHATSAPP_CLERK_USER_ID` before deploying. This ensures the existing user keeps working after the switch.
