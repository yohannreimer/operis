# WhatsApp Bot Multi-User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thread a resolved `clerkUserId` through the entire inbound WhatsApp message flow — from webhook lookup to session storage to service calls — eliminating all hardcoded `'legacy'` strings from the bot path.

**Architecture:** A single `UserPhoneService.findUserByPhone()` lookup at the webhook entry point resolves `clerkUserId` before any bot logic runs. Unknown numbers are silently ignored (200, no reply). The resolved `clerkUserId` is passed explicitly to `handleInbound`, persisted on the session (with backfill-on-read for existing sessions), and threaded through to all service method calls. `env.WHATSAPP_CLERK_USER_ID` is still used by auto-dispatch as a temporary bridge until Sub-project 3.

**Tech Stack:** TypeScript, Fastify, Prisma 5, PostgreSQL

**Prerequisite:** Sub-project 1 (Phone-User Linking) deployed — `UserPhone` table and `UserPhoneService` exist.

---

## Task 1 — Add `clerkUserId` column to `WhatsappConversationSession`

- [ ] Open `apps/api/prisma/schema.prisma`. Locate the `WhatsappConversationSession` model (currently lines 568–580). Add the `clerkUserId` field after `phoneNumber`:

  ```prisma
  model WhatsappConversationSession {
    id               String    @id @default(uuid())
    phoneNumber      String    @unique @map("phone_number")
    clerkUserId      String?   @map("clerk_user_id")
    state            String    @default("idle")
    payload          Json?
    expiresAt        DateTime? @map("expires_at")
    lastInteractionAt DateTime  @default(now()) @map("last_interaction_at")
    createdAt        DateTime  @default(now()) @map("created_at")
    updatedAt        DateTime  @updatedAt @map("updated_at")

    @@index([state, expiresAt])
    @@map("whatsapp_conversation_sessions")
  }
  ```

  Note: `String?` (nullable). Do NOT add `@unique` — the phone number column already carries that constraint.

- [ ] Run the migration from `apps/api/`:

  ```bash
  cd apps/api && npx prisma migrate dev --name add_clerk_user_id_to_session
  ```

  Expected output contains:
  ```
  The following migration(s) have been applied:
  -- migrations/YYYYMMDDHHMMSS_add_clerk_user_id_to_session/migration.sql
  ```

- [ ] Verify the generated SQL file at `apps/api/prisma/migrations/*/migration.sql` contains:
  ```sql
  ALTER TABLE "whatsapp_conversation_sessions" ADD COLUMN "clerk_user_id" TEXT;
  ```

---

## Task 2 — Update `setSession` to persist `clerkUserId`

File: `apps/api/src/services/whatsapp-conversation-service.ts`

- [ ] Locate `private async setSession(` (currently line 722). Add `clerkUserId?: string` as the last parameter and include it in the upsert `create` block:

  ```typescript
  private async setSession(
    phoneNumber: string,
    state: ConversationState,
    payload?: Prisma.JsonObject | null,
    ttlMinutes = SESSION_TTL_MINUTES,
    clerkUserId?: string
  ) {
    const expiresAt =
      state === 'idle'
        ? null
        : new Date(Date.now() + Math.max(5, ttlMinutes) * 60 * 1000);

    const moduleKey = this.stateModule(state);
    const payloadObject = {
      ...(payload ?? {}),
      lastModule: moduleKey,
      state,
      updatedAt: new Date().toISOString()
    } satisfies Prisma.JsonObject;

    await this.prisma.whatsappConversationSession.upsert({
      where: {
        phoneNumber
      },
      create: {
        phoneNumber,
        state,
        payload: payloadObject,
        expiresAt,
        lastInteractionAt: new Date(),
        ...(clerkUserId ? { clerkUserId } : {})
      },
      update: {
        state,
        payload: payloadObject,
        expiresAt,
        lastInteractionAt: new Date()
      }
    });
  }
  ```

  Key design notes:
  - `clerkUserId` goes in `create` only (the row is new, so we stamp it once). The `update` block does NOT include it because backfill-on-read in `handleInbound` handles existing rows separately.
  - Passing `undefined` leaves the field untouched — safe for all existing callers.

---

## Task 3 — Update `handleInbound` signature and add backfill-on-read

File: `apps/api/src/services/whatsapp-conversation-service.ts`

- [ ] Locate `async handleInbound(phoneNumber: string, message: string)` (currently line 1991). Change the signature to accept `clerkUserId`:

  ```typescript
  async handleInbound(phoneNumber: string, message: string, clerkUserId: string): Promise<CommandResult> {
  ```

- [ ] Inside `handleInbound`, immediately after the call to `this.getSession(phoneNumber)` (currently around line 2014), add the backfill-on-read block:

  ```typescript
  const session = await this.getSession(phoneNumber);

  // Backfill clerkUserId on sessions created before SP2
  if (session && !session.clerkUserId) {
    await this.prisma.whatsappConversationSession.update({
      where: { phoneNumber },
      data: { clerkUserId }
    });
  }
  ```

  This ensures any session row with `clerkUserId = NULL` (pre-SP2 sessions) is stamped on the next inbound message, with zero downtime migration.

---

## Task 4 — Fix `WhatsappCommandService`: thread `clerkUserId` into `buildUpcomingBlockDigest`

File: `apps/api/src/services/whatsapp-command-service.ts`

- [ ] Locate the `UpcomingDigestOptions` type (currently line 22). Add `clerkUserId` to it:

  ```typescript
  type UpcomingDigestOptions = ReminderDigestOptions & {
    withinMinutes?: number;
    clerkUserId?: string;
  };
  ```

- [ ] Locate `async buildUpcomingBlockDigest(options?: UpcomingDigestOptions)` (currently line 337). Replace the hardcoded `'legacy'` with `options?.clerkUserId ?? 'legacy'`:

  ```typescript
  async buildUpcomingBlockDigest(options?: UpcomingDigestOptions) {
    const date = options?.date ?? this.todayDate();
    const withinMinutes = Math.max(5, Math.min(120, Math.round(options?.withinMinutes ?? 20)));
    const plan = await this.dayPlanService.getByDate(date, options?.clerkUserId ?? 'legacy');
    // ... rest of method unchanged
  ```

  Note: The `?? 'legacy'` fallback ensures auto-dispatch calls that do not yet pass `clerkUserId` (until SP3) continue to work without crashing.

---

## Task 5 — Fix `WhatsappCommandService`: thread `clerkUserId` into inline inbox capture

File: `apps/api/src/services/whatsapp-command-service.ts`

- [ ] Locate the `captureMatch` block inside `handle()` (currently lines 394–414) where `clerkUserId: 'legacy'` is set on `inboxItem.create`. Change `handle()` to accept `clerkUserId` and pass it through.

  First, update the `handle` method signature (currently line 368):

  ```typescript
  async handle(rawText: string, clerkUserId = 'legacy'): Promise<CommandResult> {
  ```

  Default value `'legacy'` ensures all existing callers (auto-dispatch, tests, direct invocations) continue to work unchanged in SP2.

- [ ] Inside `handle()`, locate the `prisma.inboxItem.create` call (currently around line 402). Replace `clerkUserId: 'legacy'` with the parameter:

  ```typescript
  const inbox = await this.prisma.inboxItem.create({
    data: {
      content,
      source: 'whatsapp',
      status: 'pendente',
      clerkUserId
    }
  });
  ```

- [ ] Locate the `alocarMatch` block inside `handle()` (currently around line 554–561) where `clerkUserId: 'legacy'` is set in `dayPlanService.addItem`. Replace it with the parameter:

  ```typescript
  await this.dayPlanService.addItem({
    date,
    taskId: task.id,
    blockType: 'task',
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    clerkUserId
  });
  ```

---

## Task 6 — Update `runCommand` and all private state handlers to pass `clerkUserId`

File: `apps/api/src/services/whatsapp-conversation-service.ts`

- [ ] Locate `private async runCommand(text: string)` (currently line 774). Update its signature to accept and pass `clerkUserId`:

  ```typescript
  private async runCommand(text: string, clerkUserId: string): Promise<CommandResult> {
    try {
      return await this.commandService.handle(text, clerkUserId);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Não consegui processar esse comando.';
      return {
        reply: `Erro: ${message}`
      };
    }
  }
  ```

- [ ] Find every call site of `this.runCommand(` in the file:

  ```bash
  grep -n "this\.runCommand(" apps/api/src/services/whatsapp-conversation-service.ts
  ```

  There are approximately 30 call sites across 9 private methods. For every occurrence, change `this.runCommand(text)` → `this.runCommand(text, clerkUserId)`.

- [ ] Add `clerkUserId: string` parameter to each of the following private method signatures (these are all the methods called from `handleInbound` that call `runCommand` internally). Update the signature line only — the body changes are just the `runCommand` call fix above:

  ```typescript
  private async processMenuInput(phoneNumber: string, text: string, session: WhatsappConversationSession | null, clerkUserId: string): Promise<CommandResult>

  private async processFocusInput(phoneNumber: string, text: string, session: WhatsappConversationSession | null, clerkUserId: string): Promise<CommandResult>

  private async processDeepInput(phoneNumber: string, text: string, session: WhatsappConversationSession | null, clerkUserId: string): Promise<CommandResult>

  private async processOpenTasksInput(phoneNumber: string, text: string, session: WhatsappConversationSession | null, clerkUserId: string): Promise<CommandResult>

  private async processNotesInput(phoneNumber: string, text: string, session: WhatsappConversationSession | null, clerkUserId: string): Promise<CommandResult>

  private async handleLLMIntent(phoneNumber: string, text: string, session: WhatsappConversationSession | null, clerkUserId: string): Promise<CommandResult>

  private async processFocusConfirmation(phoneNumber: string, text: string, session: WhatsappConversationSession | null, clerkUserId: string): Promise<CommandResult>

  private async processHabitCheckin(phoneNumber: string, text: string, session: WhatsappConversationSession | null, clerkUserId: string): Promise<CommandResult>

  private async processInboxCompletePick(phoneNumber: string, text: string, session: WhatsappConversationSession | null, clerkUserId: string): Promise<CommandResult>
  ```

  > **Note on exact signatures:** The actual parameter order in the current file may differ slightly (some methods may not take `session`). Run `grep -n "private async process" apps/api/src/services/whatsapp-conversation-service.ts` to confirm exact current signatures, then add `clerkUserId: string` as the last parameter to each.

- [ ] In `handleInbound`, update every call to these methods to pass `clerkUserId` as the last argument. For example:

  ```typescript
  // Before
  return await this.processMenuInput(phoneNumber, text, session);
  // After
  return await this.processMenuInput(phoneNumber, text, session, clerkUserId);
  ```

  Run the TypeScript compiler after this step to surface any missed call sites:

  ```bash
  cd apps/api && npx tsc --noEmit 2>&1 | grep "clerkUserId\|runCommand"
  ```

  Fix any errors until the compiler is clean.

---

## Task 6b — Fix remaining `env.WHATSAPP_CLERK_USER_ID` usages in `WhatsappConversationService`

File: `apps/api/src/services/whatsapp-conversation-service.ts`

Two places in the conversation service still reference `env.WHATSAPP_CLERK_USER_ID` directly instead of using the resolved `clerkUserId` from `handleInbound`. Both involve habit lookups.

- [ ] Search for all remaining occurrences:

  ```bash
  grep -n "WHATSAPP_CLERK_USER_ID" apps/api/src/services/whatsapp-conversation-service.ts
  ```

  Expected: 2 lines.

- [ ] Fix the first occurrence — in the habits menu branch (inside `processMenuInput`, around line 851):

  Change:
  ```typescript
  const todayStats = await habitService.getTodayStats(todayKey, env.WHATSAPP_CLERK_USER_ID);
  ```
  To:
  ```typescript
  const todayStats = await habitService.getTodayStats(todayKey, clerkUserId);
  ```

  This works because `processMenuInput` now receives `clerkUserId` as a parameter (Task 6).

- [ ] Fix the second occurrence — in the `__open_habit_checkin__` branch of `handleInbound` (around line 2084):

  Change:
  ```typescript
  const todayStats = await habitService.getTodayStats(todayKey, env.WHATSAPP_CLERK_USER_ID);
  ```
  To:
  ```typescript
  const todayStats = await habitService.getTodayStats(todayKey, clerkUserId);
  ```

  `handleInbound` receives `clerkUserId` directly as a parameter (Task 3).

- [ ] Verify no more `WHATSAPP_CLERK_USER_ID` references remain in this file:

  ```bash
  grep -c "WHATSAPP_CLERK_USER_ID" apps/api/src/services/whatsapp-conversation-service.ts
  ```

  Expected: `0`

---

## Task 6c — Update `setSessionPublic` to forward `clerkUserId`

File: `apps/api/src/services/whatsapp-conversation-service.ts`

`setSessionPublic` is called by `WhatsappAutoDispatchService` to create sessions after proactive messages. It wraps the private `setSession`. After Task 2 added `clerkUserId?` to `setSession`, `setSessionPublic` should also expose that parameter so auto-dispatch can pass the user's `clerkUserId` when creating sessions in SP3.

- [ ] Locate `setSessionPublic` (currently around line 765). Update its signature to accept optional `clerkUserId`:

  ```typescript
  async setSessionPublic(
    phone: string,
    state: ConversationState,
    payload: Prisma.JsonObject | null,
    ttl?: number,
    clerkUserId?: string
  ): Promise<void> {
    await this.setSession(phone, state, payload ?? undefined, ttl, clerkUserId);
  }
  ```

  Auto-dispatch callers that do not yet pass `clerkUserId` (all of them in SP2) will use the `undefined` default — safe, backwards-compatible.

---

## Task 7 — Fix `WhatsappProactivityEngine`: thread `clerkUserId` into `evaluate`

File: `apps/api/src/services/whatsapp-proactivity-engine.ts`

- [ ] Locate `async evaluate(clock: LocalClock, humor: DayHumor | null)` (currently line 65). Add `clerkUserId` as the third parameter with a default fallback:

  ```typescript
  async evaluate(
    clock: LocalClock,
    humor: DayHumor | null,
    clerkUserId = 'legacy'
  ): Promise<ProactiveMessage | null> {
  ```

  Default `'legacy'` ensures auto-dispatch still works in SP2 without changes to its call site (SP3 removes the default).

- [ ] Locate `triggerStreakCelebration()` call inside `evaluate` (currently line 87). That trigger calls `habitService.getRadarStats('legacy')` internally (line 486). Pass `clerkUserId` to `triggerStreakCelebration`:

  Update the `Promise.all` call inside `evaluate` to:
  ```typescript
  const [t1, t2, t3, t4, t5, t6, t7, t8] = await Promise.all([
    this.triggerTop3Unconfirmed(clock),
    this.triggerDeepWorkWindow(clock),
    this.triggerBlockedTaskA(clock),
    this.triggerAfternoonCheckin(clock),
    this.triggerTop3Complete(clock),
    this.triggerLongSilence(clock),
    this.triggerWeeklyReview(clock),
    this.triggerStreakCelebration(clerkUserId),
  ]);
  ```

- [ ] Update `triggerStreakCelebration` signature (currently a no-arg private method around line 480) to accept `clerkUserId`:

  ```typescript
  private async triggerStreakCelebration(clerkUserId: string): Promise<ProactiveMessage | null> {
    try {
      const habitService = new HabitService(this.prisma);
      const event = await habitService.getUnnotifiedStreakEvents();
      if (!event) return null;

      const streakDays = event.reason === 'streak_7' ? 7 : event.reason === 'streak_30' ? 30 : 100;
      const levelInfo = (await habitService.getRadarStats(clerkUserId))[event.lifeArea];
      // ... rest of method unchanged
  ```

---

## Task 8 — Update `registerWebhookRoutes` to accept and use `UserPhoneService`

File: `apps/api/src/routes/webhooks.ts`

- [ ] Add the import for `UserPhoneService` at the top of the file:

  ```typescript
  import { UserPhoneService } from '../services/user-phone-service.js';
  ```

- [ ] Update the `registerWebhookRoutes` function signature (currently line 253) to add `userPhoneService`:

  ```typescript
  export function registerWebhookRoutes(
    app: FastifyInstance,
    commandService: WhatsappCommandService,
    conversationService: WhatsappConversationService,
    prisma: PrismaClient,
    userPhoneService: UserPhoneService
  )
  ```

- [ ] Inside the `app.post('/webhooks/whatsapp', ...)` handler, locate the section before `conversationService.handleInbound` is called (currently around line 374–376). Insert the phone lookup and early return for unknown numbers:

  ```typescript
  // ── Resolve user from phone number ────────────────────────────────────────
  const phoneNumber = payload.from; // already normalized digit-only by normalizePhone()
  const resolvedUser = await userPhoneService.findUserByPhone(phoneNumber);
  if (!resolvedUser) {
    // Unknown number — silently acknowledge to WhatsApp provider, no reply
    return reply.code(200).send({ ok: true, skipped: 'unknown_phone' });
  }
  const clerkUserId = resolvedUser.clerkUserId;

  let commandResult: Awaited<ReturnType<typeof conversationService.handleInbound>>;
  try {
    commandResult = await conversationService.handleInbound(payload.from, finalMessage, clerkUserId);
  } catch (error) {
  ```

  Note: `payload.from` is the already-normalized phone string. The existing variable `finalMessage` (set after audio transcription) must remain the second argument.

---

## Task 9 — Update `app.ts` to inject `UserPhoneService`

File: `apps/api/src/app.ts`

- [ ] Add the import for `UserPhoneService` (add alongside other service imports):

  ```typescript
  import { UserPhoneService } from './services/user-phone-service.js';
  ```

- [ ] After existing service instantiations (around line 57), instantiate `userPhoneService`:

  ```typescript
  const userPhoneService = new UserPhoneService(prisma);
  ```

- [ ] Update the `registerWebhookRoutes` call (currently line 84) to pass `userPhoneService` as the fifth argument:

  ```typescript
  registerWebhookRoutes(app, whatsappCommandService, whatsappConversationService, prisma, userPhoneService);
  ```

---

## Task 10 — Update auto-dispatch call to `evaluate` (bridge until SP3)

File: `apps/api/src/services/whatsapp-auto-dispatch-service.ts`

- [ ] Locate the `proactivityEngine.evaluate(clock, null)` call (currently line 314). Update it to pass `env.WHATSAPP_CLERK_USER_ID`:

  ```typescript
  const proactiveMessage = await this.proactivityEngine.evaluate(clock, null, env.WHATSAPP_CLERK_USER_ID);
  ```

  This is the SP2 bridge — removed in SP3 when auto-dispatch becomes per-user.

---

## Task 11 — Smoke-test with curl

- [ ] Start the API server:
  ```bash
  cd apps/api && npm run dev
  ```

- [ ] Send a message from a registered phone number (must exist in `UserPhone` table). Replace `<SECRET>`, `<REGISTERED_PHONE>`:

  ```bash
  curl -s -X POST http://localhost:3000/webhooks/whatsapp \
    -H "Content-Type: application/json" \
    -H "x-webhook-secret: <SECRET>" \
    -d '{"from": "<REGISTERED_PHONE>", "message": "menu"}' | jq .
  ```

  Expected response:
  ```json
  { "ok": true }
  ```

  Expected side-effect: a WhatsApp message is queued containing the menu text.

- [ ] Send a message from an unregistered phone number:

  ```bash
  curl -s -X POST http://localhost:3000/webhooks/whatsapp \
    -H "Content-Type: application/json" \
    -H "x-webhook-secret: <SECRET>" \
    -d '{"from": "0000000000", "message": "menu"}' | jq .
  ```

  Expected response:
  ```json
  { "ok": true, "skipped": "unknown_phone" }
  ```

  Expected side-effect: no message queued, no session created.

- [ ] Verify `clerkUserId` is written to the session. Connect to the database and run:

  ```sql
  SELECT phone_number, clerk_user_id, state
  FROM whatsapp_conversation_sessions
  WHERE phone_number = '<REGISTERED_PHONE>';
  ```

  Expected: `clerk_user_id` matches the `clerkUserId` associated with that phone in `UserPhone`.

- [ ] Send an inbox capture command and verify the inbox item has the correct `clerkUserId`:

  ```bash
  curl -s -X POST http://localhost:3000/webhooks/whatsapp \
    -H "Content-Type: application/json" \
    -H "x-webhook-secret: <SECRET>" \
    -d '{"from": "<REGISTERED_PHONE>", "message": "capturar teste sp2"}' | jq .
  ```

  Then in the database:
  ```sql
  SELECT content, source, clerk_user_id
  FROM inbox_items
  WHERE content = 'teste sp2';
  ```

  Expected: `clerk_user_id` is the real user ID, not `'legacy'`.

- [ ] Trigger `buildUpcomingBlockDigest` via the manual dispatch route (if available) and confirm no 'legacy' appears in logs. Alternatively, check the API logs for any remaining `'legacy'` string warnings after the above flows.

---

## Summary of changed files

| File | What changes |
|---|---|
| `apps/api/prisma/schema.prisma` | Add `clerkUserId String?` to `WhatsappConversationSession` |
| `apps/api/prisma/migrations/*/migration.sql` | Auto-generated: `ALTER TABLE ... ADD COLUMN "clerk_user_id" TEXT` |
| `apps/api/src/services/whatsapp-conversation-service.ts` | `setSession` +`clerkUserId?` param; `setSessionPublic` +`clerkUserId?` param; `handleInbound` +`clerkUserId` param + backfill-on-read; `runCommand` +`clerkUserId` param; all 9 state handler methods +`clerkUserId` threading; 2 `env.WHATSAPP_CLERK_USER_ID` usages replaced |
| `apps/api/src/services/whatsapp-command-service.ts` | `handle()` +`clerkUserId` param with `'legacy'` default; `buildUpcomingBlockDigest` reads from options; inline inbox create + alocar addItem use param |
| `apps/api/src/services/whatsapp-proactivity-engine.ts` | `evaluate()` +`clerkUserId` param; `triggerStreakCelebration()` +`clerkUserId` param replacing `'legacy'` |
| `apps/api/src/services/whatsapp-auto-dispatch-service.ts` | Pass `env.WHATSAPP_CLERK_USER_ID` to `evaluate()` |
| `apps/api/src/routes/webhooks.ts` | Import `UserPhoneService`; add it as 5th param to `registerWebhookRoutes`; phone lookup + early-return before `handleInbound`; pass `clerkUserId` to `handleInbound` |
| `apps/api/src/app.ts` | Import + instantiate `UserPhoneService`; pass to `registerWebhookRoutes` |
