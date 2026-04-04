# Phone-User Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a UserPhone table mapping phoneNumbers to Clerk user IDs, expose GET/POST/DELETE /user/phone API endpoints, and build a web settings page for users to link their WhatsApp number.

**Architecture:** New `UserPhone` Prisma model with unique constraints on both phoneNumber and clerkUserId (one user, one number). A `UserPhoneService` handles upsert-by-clerkUserId with conflict detection. API routes are auth-protected via Clerk JWT. Web settings page fetches and mutates via the existing api.ts pattern.

**Tech Stack:** TypeScript, Fastify, Prisma 5, PostgreSQL, React, React Router v6, Clerk

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/prisma/schema.prisma` | Modify | Add `UserPhone` model |
| `apps/api/src/services/user-phone-service.ts` | Create | `UserPhoneService` class + `ConflictError` |
| `apps/api/src/routes/user-phone.ts` | Create | GET/POST/DELETE `/user/phone` route handlers |
| `apps/api/src/app.ts` | Modify | Instantiate `UserPhoneService`, register route |
| `apps/api/src/seed.ts` | Modify | Seed `UserPhone` from env vars |
| `apps/web/src/api.ts` | Modify | Add `UserPhone` type + phone API methods |
| `apps/web/src/pages/configuracoes.tsx` | Create | Settings page with phone linking UI |
| `apps/web/src/App.tsx` | Modify | Add `/configuracoes` lazy route inside Layout |

---

## Task 1: Add UserPhone model to Prisma schema and migrate

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

### Steps

- [ ] **Step 1.1: Add UserPhone model to schema.prisma**

Open `apps/api/prisma/schema.prisma`. After the final model in the file (currently `MindMap`, ending around line 874), append the following block:

```prisma
model UserPhone {
  id          String   @id @default(uuid())
  phoneNumber String   @unique @map("phone_number")
  clerkUserId String   @unique @map("clerk_user_id")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@map("user_phones")
}
```

- [ ] **Step 1.2: Run the migration**

```bash
cd apps/api && npx prisma migrate dev --name add_user_phone
```

Expected output (last lines):
```
The following migration(s) have been applied:

migrations/
  └─ 20260404xxxxxx_add_user_phone/
    └─ migration.sql

Your database is now in sync with your schema.
Generated Prisma Client (v5.x.x)
```

- [ ] **Step 1.3: Verify the generated client has UserPhone**

```bash
cd apps/api && node -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); console.log(typeof p.userPhone);"
```

Expected output: `object`

---

## Task 2: Create UserPhoneService

**Files:**
- Create: `apps/api/src/services/user-phone-service.ts`

### Steps

- [ ] **Step 2.1: Create the service file**

Create `apps/api/src/services/user-phone-service.ts` with the following content:

```typescript
import { PrismaClient } from '@prisma/client';

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '');
}

export class UserPhoneService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Returns the clerkUserId that owns the given phone number, or null if not found.
   * Uses the unique index on phoneNumber for O(1) lookup.
   */
  async findUserByPhone(phoneNumber: string): Promise<string | null> {
    const normalized = normalizePhone(phoneNumber);
    const record = await this.prisma.userPhone.findUnique({
      where: { phoneNumber: normalized },
      select: { clerkUserId: true },
    });
    return record?.clerkUserId ?? null;
  }

  /**
   * Links a phone number to a Clerk user (upsert by clerkUserId).
   * If the new phoneNumber is already owned by a DIFFERENT user, throws ConflictError.
   * The user can change their own number freely (upsert replaces the old one).
   */
  async linkPhone(clerkUserId: string, phoneNumber: string): Promise<void> {
    const normalized = normalizePhone(phoneNumber);

    // Check if this phone is owned by a different user
    const existing = await this.prisma.userPhone.findFirst({
      where: {
        phoneNumber: normalized,
        NOT: { clerkUserId },
      },
      select: { clerkUserId: true },
    });

    if (existing) {
      throw new ConflictError('Número já cadastrado por outro usuário');
    }

    // Upsert by clerkUserId — allows the user to change their number
    await this.prisma.userPhone.upsert({
      where: { clerkUserId },
      update: { phoneNumber: normalized },
      create: { clerkUserId, phoneNumber: normalized },
    });
  }

  /**
   * Unlinks the phone number associated with the given clerkUserId.
   * Idempotent: returns without error if no record exists.
   * Also deletes the WhatsappConversationSession for the phone number.
   */
  async unlinkPhone(clerkUserId: string): Promise<void> {
    const record = await this.prisma.userPhone.findUnique({
      where: { clerkUserId },
      select: { phoneNumber: true },
    });

    if (!record) {
      // Idempotent — nothing to do
      return;
    }

    // Delete the UserPhone row
    await this.prisma.userPhone.delete({
      where: { clerkUserId },
    });

    // Delete the associated WhatsApp conversation session for this phone number
    await this.prisma.whatsappConversationSession.deleteMany({
      where: { phoneNumber: record.phoneNumber },
    });
  }

  /**
   * Returns the phone number linked to the given clerkUserId, or null if not linked.
   */
  async getPhoneForUser(clerkUserId: string): Promise<string | null> {
    const record = await this.prisma.userPhone.findUnique({
      where: { clerkUserId },
      select: { phoneNumber: true },
    });
    return record?.phoneNumber ?? null;
  }
}
```

---

## Task 3: Create user-phone route handlers

**Files:**
- Create: `apps/api/src/routes/user-phone.ts`

### Steps

- [ ] **Step 3.1: Create the route file**

Create `apps/api/src/routes/user-phone.ts` with the following content:

```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getUserId } from '../middleware/auth.js';
import { UserPhoneService, ConflictError } from '../services/user-phone-service.js';

const linkPhoneBody = z.object({
  phoneNumber: z.string().min(1, 'phoneNumber é obrigatório'),
});

export function registerUserPhoneRoutes(
  app: FastifyInstance,
  userPhoneService: UserPhoneService,
) {
  // GET /user/phone — returns current linked phone (always 200, null if not linked)
  app.get('/user/phone', async (request, reply) => {
    const clerkUserId = getUserId(request);
    const phoneNumber = await userPhoneService.getPhoneForUser(clerkUserId);
    return reply.status(200).send({ phoneNumber });
  });

  // POST /user/phone — links a phone number to the authenticated user
  app.post('/user/phone', async (request, reply) => {
    const clerkUserId = getUserId(request);

    const parsed = linkPhoneBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.errors[0].message });
    }

    try {
      await userPhoneService.linkPhone(clerkUserId, parsed.data.phoneNumber);
      return reply.status(200).send({ ok: true });
    } catch (error) {
      if (error instanceof ConflictError) {
        return reply.status(409).send({ error: 'Número já cadastrado por outro usuário' });
      }
      throw error;
    }
  });

  // DELETE /user/phone — unlinks the phone number from the authenticated user (idempotent)
  app.delete('/user/phone', async (request, reply) => {
    const clerkUserId = getUserId(request);
    await userPhoneService.unlinkPhone(clerkUserId);
    return reply.status(200).send({ ok: true });
  });
}
```

---

## Task 4: Wire UserPhoneService and routes into app.ts

**Files:**
- Modify: `apps/api/src/app.ts`

### Steps

- [ ] **Step 4.1: Add imports to app.ts**

In `apps/api/src/app.ts`, locate the block of service imports (around line 21–31). After the last import in that block (currently `import { InboxWatcherService } from './services/inbox-watcher-service.js';`), add these two lines:

```typescript
import { UserPhoneService } from './services/user-phone-service.js';
import { registerUserPhoneRoutes } from './routes/user-phone.js';
```

- [ ] **Step 4.2: Instantiate UserPhoneService and register route**

In `apps/api/src/app.ts`, inside the `buildApp()` function, locate the line:

```typescript
const inboxWatcherService = new InboxWatcherService(prisma);
```

Immediately before that line, add:

```typescript
const userPhoneService = new UserPhoneService(prisma);
```

Then, after the line `registerCanvasRoutes(app, prisma);` (currently the last `register...` call before `inboxWatcherService`), add:

```typescript
registerUserPhoneRoutes(app, userPhoneService);
```

The relevant section of `app.ts` after the changes should look like:

```typescript
  registerHabitRoutes(app, prisma);
  registerCanvasRoutes(app, prisma);

  const userPhoneService = new UserPhoneService(prisma);
  registerUserPhoneRoutes(app, userPhoneService);

  const inboxWatcherService = new InboxWatcherService(prisma);
```

---

## Task 5: Update seed.ts to seed UserPhone

**Files:**
- Modify: `apps/api/src/seed.ts`

### Steps

- [ ] **Step 5.1: Add UserPhone seeding to seed.ts**

The existing `seed.ts` (`apps/api/src/seed.ts`) already imports `prisma` from `'./db.js'` and has a `main()` function. Add the phone seeding block at the end of `main()`, before `console.log('Seed concluído...')`.

Replace the current file content with:

```typescript
import { prisma } from './db.js';

async function main() {
  const defaults = [
    { name: 'Pessoal', type: 'pessoal' as const },
    { name: 'Geral', type: 'geral' as const }
  ];

  for (const workspace of defaults) {
    await prisma.workspace.upsert({
      where: {
        id: `00000000-0000-0000-0000-${workspace.type === 'pessoal' ? '000000000001' : '000000000002'}`
      },
      update: {
        name: workspace.name,
        type: workspace.type
      },
      create: {
        id: `00000000-0000-0000-0000-${workspace.type === 'pessoal' ? '000000000001' : '000000000002'}`,
        name: workspace.name,
        type: workspace.type,
        clerkUserId: 'legacy'
      }
    });
  }

  const state = await prisma.gamificationState.findFirst({
    orderBy: { lastUpdate: 'desc' }
  });

  if (!state) {
    await prisma.gamificationState.create({
      data: { clerkUserId: 'legacy' }
    });
  }

  // Seed UserPhone from environment variables
  const defaultPhone = process.env.DEFAULT_PHONE_NUMBER;
  const whatsappClerkUserId = process.env.WHATSAPP_CLERK_USER_ID;

  if (defaultPhone && whatsappClerkUserId) {
    const normalizedPhone = defaultPhone.replace(/\D/g, '');
    await prisma.userPhone.upsert({
      where: { clerkUserId: whatsappClerkUserId },
      update: { phoneNumber: normalizedPhone },
      create: {
        clerkUserId: whatsappClerkUserId,
        phoneNumber: normalizedPhone,
      },
    });
    console.log(`UserPhone seeded: ${normalizedPhone} → ${whatsappClerkUserId}`);
  } else {
    console.log('Skipping UserPhone seed: DEFAULT_PHONE_NUMBER or WHATSAPP_CLERK_USER_ID not set.');
  }

  console.log('Seed concluído com workspaces padrão.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 5.2: Run the seed to verify it works**

```bash
cd apps/api && DEFAULT_PHONE_NUMBER=5511999999999 WHATSAPP_CLERK_USER_ID=user_test123 npm run seed
```

Expected output:
```
UserPhone seeded: 5511999999999 → user_test123
Seed concluído com workspaces padrão.
```

Run again to verify idempotency (should produce same output without error).

---

## Task 6: Add UserPhone type and api methods to web/src/api.ts

**Files:**
- Modify: `apps/web/src/api.ts`

### Steps

- [ ] **Step 6.1: Add UserPhone type**

In `apps/web/src/api.ts`, locate the Canvas section comment `// ── Canvas ──...` (around line 231). Immediately before that comment, add the following type:

```typescript
// ── Phone ─────────────────────────────────────────────────────────────────

export type UserPhone = {
  phoneNumber: string | null;
};
```

- [ ] **Step 6.2: Add phone API methods to the api object**

In `apps/web/src/api.ts`, locate the closing brace of the `api` object (the `};` at line 2038). Immediately before it, inside the object, add these three methods:

```typescript
  getUserPhone: () =>
    apiRequest<UserPhone>('/user/phone'),
  linkPhone: (phoneNumber: string) =>
    apiRequest<{ ok: boolean }>('/user/phone', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    }),
  unlinkPhone: () =>
    apiRequest<{ ok: boolean }>('/user/phone', { method: 'DELETE' }),
```

The end of the `api` object should look like:

```typescript
    apiRequest<MindMap>(`/canvas/notes/${noteId}/mindmap/generate`, {
      method: 'POST',
      body: JSON.stringify({ overwrite }),
    }),
  getUserPhone: () =>
    apiRequest<UserPhone>('/user/phone'),
  linkPhone: (phoneNumber: string) =>
    apiRequest<{ ok: boolean }>('/user/phone', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    }),
  unlinkPhone: () =>
    apiRequest<{ ok: boolean }>('/user/phone', { method: 'DELETE' }),
};
```

---

## Task 7: Create Configuracoes page

> **Route naming note:** Route is `/configuracoes` (not `/settings` as shown in the spec) — following the app's Portuguese route naming convention (`/habitos`, `/frentes`, etc.).

**Files:**
- Create: `apps/web/src/pages/configuracoes.tsx`

### Steps

- [ ] **Step 7.1: Create the page file**

Create `apps/web/src/pages/configuracoes.tsx` with the following content:

```tsx
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import {
  PremiumCard,
  PremiumHeader,
  PremiumPage,
} from '../components/premium-ui';

type LoadState = 'loading' | 'idle' | 'saving' | 'error';

export function ConfiguracoesPage() {
  const [linkedPhone, setLinkedPhone] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch current phone on mount
  useEffect(() => {
    let cancelled = false;

    async function fetchPhone() {
      setLoadState('loading');
      setLoadError(null);
      try {
        const result = await api.getUserPhone();
        if (!cancelled) {
          setLinkedPhone(result.phoneNumber);
          setLoadState('idle');
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Erro ao carregar número.');
          setLoadState('error');
        }
      }
    }

    fetchPhone();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLink() {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setActionError('Informe um número de telefone.');
      return;
    }

    setActionError(null);
    setLoadState('saving');

    try {
      await api.linkPhone(trimmed);
      const result = await api.getUserPhone();
      setLinkedPhone(result.phoneNumber);
      setInputValue('');
      setLoadState('idle');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao vincular número.';
      // Detect conflict: 409 error message matches the API error string
      if (message.includes('Número já cadastrado por outro usuário') || message.includes('já cadastrado')) {
        setActionError('Esse número já está cadastrado por outro usuário');
      } else {
        setActionError(message);
      }
      setLoadState('idle');
    }
  }

  async function handleUnlink() {
    setActionError(null);
    setLoadState('saving');

    try {
      await api.unlinkPhone();
      setLinkedPhone(null);
      setLoadState('idle');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao desvincular número.');
      setLoadState('idle');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      handleLink();
    }
  }

  const isLoading = loadState === 'loading';
  const isSaving = loadState === 'saving';
  const disabled = isLoading || isSaving;

  return (
    <PremiumPage>
      <PremiumHeader title="Configurações" />

      <PremiumCard>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>WhatsApp</div>
          <div style={{ fontSize: 13, opacity: 0.65, marginBottom: 8 }}>
            Vincule seu número de WhatsApp para usar o assistente via mensagem.
          </div>

          {isLoading && (
            <div style={{ fontSize: 13, opacity: 0.5 }}>Carregando...</div>
          )}

          {!isLoading && loadState === 'error' && (
            <div style={{ fontSize: 13, color: 'var(--color-danger, #e55)' }}>
              {loadError}
            </div>
          )}

          {!isLoading && loadState !== 'error' && linkedPhone === null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="5511999999999"
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setActionError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  disabled={disabled}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--color-border, #333)',
                    background: 'var(--color-surface, #1a1a1a)',
                    color: 'inherit',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleLink}
                  disabled={disabled}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--color-accent, #4f7cff)',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.6 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isSaving ? 'Vinculando...' : 'Vincular'}
                </button>
              </div>
              {actionError && (
                <div style={{ fontSize: 13, color: 'var(--color-danger, #e55)' }}>
                  {actionError}
                </div>
              )}
            </div>
          )}

          {!isLoading && loadState !== 'error' && linkedPhone !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--color-border, #333)',
                    background: 'var(--color-surface, #1a1a1a)',
                    fontSize: 14,
                    fontFamily: 'monospace',
                  }}
                >
                  {linkedPhone}
                </div>
                <button
                  onClick={handleUnlink}
                  disabled={disabled}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--color-border, #333)',
                    background: 'transparent',
                    color: 'var(--color-danger, #e55)',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.6 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isSaving ? 'Desvinculando...' : 'Desvincular'}
                </button>
              </div>
              {actionError && (
                <div style={{ fontSize: 13, color: 'var(--color-danger, #e55)' }}>
                  {actionError}
                </div>
              )}
            </div>
          )}
        </div>
      </PremiumCard>
    </PremiumPage>
  );
}
```

---

## Task 8: Register /configuracoes route in App.tsx

**Files:**
- Modify: `apps/web/src/App.tsx`

### Steps

- [ ] **Step 8.1: Add lazy import for ConfiguracoesPage**

In `apps/web/src/App.tsx`, locate the existing lazy import block (lines 7–15). After the last lazy import (currently `HabitosPage`), add:

```typescript
const ConfiguracoesPage = lazy(() => import('./pages/configuracoes').then((module) => ({ default: module.ConfiguracoesPage })));
```

- [ ] **Step 8.2: Add the route inside Layout**

In `apps/web/src/App.tsx`, inside the `<Route path="/" element={<Layout />}>` block, locate the catch-all route:

```tsx
<Route path="*" element={<Navigate to="/" replace />} />
```

Immediately before it, add:

```tsx
<Route path="configuracoes" element={<ConfiguracoesPage />} />
```

The relevant section of routes inside Layout should now include:

```tsx
<Route path="habitos" element={<HabitosPage />} />
<Route path="inbox" element={<InboxPage />} />
<Route path="gamificacao" element={<Navigate to="/" replace />} />
<Route path="configuracoes" element={<ConfiguracoesPage />} />
<Route path="*" element={<Navigate to="/" replace />} />
```

---

## Task 9: Verify the full implementation with curl

**Prerequisites:** API server running locally (e.g. `npm run dev` in `apps/api`). Replace `<TOKEN>` with a valid Clerk JWT for the test user.

### Steps

- [ ] **Step 9.1: GET /user/phone (no phone linked — expect null)**

```bash
curl -s -X GET http://localhost:3000/user/phone \
  -H "Authorization: Bearer <TOKEN>" | jq .
```

Expected:
```json
{ "phoneNumber": null }
```

- [ ] **Step 9.2: POST /user/phone — link a phone number**

```bash
curl -s -X POST http://localhost:3000/user/phone \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+55 11 99999-9999"}' | jq .
```

Expected:
```json
{ "ok": true }
```

- [ ] **Step 9.3: GET /user/phone — confirm phone is linked and normalized**

```bash
curl -s -X GET http://localhost:3000/user/phone \
  -H "Authorization: Bearer <TOKEN>" | jq .
```

Expected:
```json
{ "phoneNumber": "5511999999999" }
```

- [ ] **Step 9.4: POST /user/phone with same number from a different user — expect 409**

Using a second Clerk token `<TOKEN_2>` (different clerkUserId):

```bash
curl -s -X POST http://localhost:3000/user/phone \
  -H "Authorization: Bearer <TOKEN_2>" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "5511999999999"}' | jq .
```

Expected:
```json
{ "error": "Número já cadastrado por outro usuário" }
```

HTTP status code should be 409. Verify with:

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/user/phone \
  -H "Authorization: Bearer <TOKEN_2>" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "5511999999999"}'
```

Expected: `409`

- [ ] **Step 9.5: DELETE /user/phone — unlink**

```bash
curl -s -X DELETE http://localhost:3000/user/phone \
  -H "Authorization: Bearer <TOKEN>" | jq .
```

Expected:
```json
{ "ok": true }
```

- [ ] **Step 9.6: GET /user/phone after delete — confirm null again**

```bash
curl -s -X GET http://localhost:3000/user/phone \
  -H "Authorization: Bearer <TOKEN>" | jq .
```

Expected:
```json
{ "phoneNumber": null }
```

- [ ] **Step 9.7: DELETE /user/phone again — confirm idempotency**

```bash
curl -s -X DELETE http://localhost:3000/user/phone \
  -H "Authorization: Bearer <TOKEN>" | jq .
```

Expected: same `{ "ok": true }` — no error, no crash.

- [ ] **Step 9.8: POST /user/phone with empty body — expect 400 validation error**

```bash
curl -s -X POST http://localhost:3000/user/phone \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```

Expected:
```json
{ "error": "phoneNumber é obrigatório" }
```

HTTP status: `400`

- [ ] **Step 9.9: Verify WhatsappConversationSession deletion on unlink**

First ensure a `WhatsappConversationSession` row exists for `5511999999999` in the database, then link the phone and unlink. After the DELETE call, run:

```bash
cd apps/api && npx prisma studio
```

Navigate to `WhatsappConversationSession` table and confirm no row exists for `phone_number = '5511999999999'`.

---

## Task 10: Verify web page in browser

### Steps

- [ ] **Step 10.1: Start the web dev server**

```bash
cd apps/web && npm run dev
```

- [ ] **Step 10.2: Navigate to /configuracoes**

Open `http://localhost:5173/configuracoes` in the browser. Confirm:
- Page loads without console errors
- The "WhatsApp" card renders with the input and "Vincular" button (not-linked state)

- [ ] **Step 10.3: Test link flow**

Type `5511999999999` in the input and click "Vincular". Confirm:
- The button shows "Vinculando..." during the request
- After success, the input disappears and the phone number is shown with a "Desvincular" button

- [ ] **Step 10.4: Test conflict error display**

Open a second browser session (or incognito) logged in as a different user. Navigate to `/configuracoes`, type `5511999999999`, click "Vincular". Confirm:
- Error message "Esse número já está cadastrado por outro usuário" appears below the input
- The input remains editable

- [ ] **Step 10.5: Test unlink flow**

Back in the first session, click "Desvincular". Confirm:
- The button shows "Desvinculando..." during the request
- After success, the card returns to the not-linked state with the input field
