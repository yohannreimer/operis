# Auto-Dispatch Fan-Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor WhatsApp auto-dispatch from single-user to fan-out — query all registered UserPhone records on every tick and send morning briefings, evening check-ins, and proactive messages to each user independently. Remove the DEFAULT_PHONE_NUMBER and WHATSAPP_CLERK_USER_ID declarations from `apps/api/src/config.ts` only.

> **Scope note:** `apps/worker/` is explicitly out of scope for this plan. The worker package (`apps/worker/src/handlers.ts`) still uses `DEFAULT_PHONE_NUMBER` in 3 places (block-start, block-end, and followup messages). Do NOT touch the worker. `DEFAULT_PHONE_NUMBER` stays in `.env` because the worker still needs it.

**Architecture:** `tick()` is split into a fan-out loop (per-user) and a global block (vice XP). `sentKeys` are namespaced per user. Manual dispatch routes also fan-out to all registered users. All services receive the per-user `clerkUserId` instead of the hardcoded env var.

**Tech Stack:** TypeScript, Fastify, Prisma 5, PostgreSQL

**Prerequisites:** Sub-projects 1 and 2 deployed — `UserPhone` table exists, `handleInbound` already threaded with `clerkUserId`.

---

## Files touched

| File | Change |
|---|---|
| `apps/api/src/services/whatsapp-auto-dispatch-service.ts` | Fan-out tick, per-user sentKeys, enqueueMessage signature |
| `apps/api/src/routes/webhooks.ts` | Manual dispatch routes fan-out; remove resolveDispatchRecipient usage |
| `apps/api/src/config.ts` | Remove DEFAULT_PHONE_NUMBER and WHATSAPP_CLERK_USER_ID |

---

## Task 1 — Refactor `enqueueMessage` to accept `phoneNumber`

**File:** `apps/api/src/services/whatsapp-auto-dispatch-service.ts`

- [ ] Change the signature of `enqueueMessage` from:

  ```typescript
  private async enqueueMessage(message: string) {
    await publishEvent(queueNames.sendWhatsappMessage, {
      to: env.DEFAULT_PHONE_NUMBER,
      message
    });
  }
  ```

  To:

  ```typescript
  private async enqueueMessage(message: string, phoneNumber: string) {
    await publishEvent(queueNames.sendWhatsappMessage, {
      to: phoneNumber,
      message
    });
  }
  ```

  At this point the file will not compile — that is expected. The callers are updated in Task 3.

---

## Task 2 — Extract `tickForUser` private method

**File:** `apps/api/src/services/whatsapp-auto-dispatch-service.ts`

The goal is to move all per-user logic out of `tick()` into a new `tickForUser(clock, phoneNumber, clerkUserId)` method. Do this in one edit.

- [ ] Add the following private method after the closing brace of the existing `tick()` method:

  ```typescript
  private async tickForUser(clock: LocalClock, phoneNumber: string, clerkUserId: string) {
    const morningMinutes = this.morningTime.hour * 60 + this.morningTime.minute;
    const morningKey = `morning:${clock.dateKey}:${clerkUserId}`;

    // ── Morning briefing ─────────────────────────────────────────────────────
    if (clock.totalMinutes >= morningMinutes && !this.wasSent(morningKey)) {
      const messages: string[] = [];

      try {
        const intelligentMessages = await this.briefingService.buildIntelligentBriefing(clock.dateKey);
        messages.push(...intelligentMessages);
      } catch {
        const morning = await this.commandService.buildMorningBriefing({ date: clock.dateKey });
        messages.push(morning);
      }

      const dueDigest = await this.commandService.buildDueReminderDigest({ date: clock.dateKey });
      if (dueDigest) messages.push(dueDigest);

      const followupDigest = await this.commandService.buildWaitingFollowupDigest({ date: clock.dateKey });
      if (followupDigest) messages.push(followupDigest);

      for (const message of messages) {
        await this.enqueueMessage(message, phoneNumber);
      }

      if (this.conversationService) {
        try {
          const top3 = await this.briefingService.getTop3ForDate(clock.dateKey);
          await this.conversationService.setSessionPublic(
            phoneNumber,
            'awaiting_focus_confirmation',
            { top3 } as Prisma.JsonObject,
            60
          );
          this.logger.info({ date: clock.dateKey, phoneNumber }, 'Sessão awaiting_focus_confirmation criada após briefing.');
        } catch (err) {
          this.logger.warn({ err }, 'Falha ao criar sessão pós-briefing.');
        }
      }

      this.rememberSent(morningKey);
      this.logger.info({ date: clock.dateKey, phoneNumber, sent: messages.length }, 'WhatsApp briefing matinal enviado.');
    }

    // ── Check-in noturno de hábitos ──────────────────────────────────────────
    const eveningMinutes = this.eveningTime.hour * 60 + this.eveningTime.minute;
    const eveningKey = `habit_checkin:${clock.dateKey}:${clerkUserId}`;
    if (clock.totalMinutes >= eveningMinutes && clock.totalMinutes <= eveningMinutes + 5 && !this.wasSent(eveningKey)) {
      try {
        const habitService = new HabitService(this.prisma);
        const todayStats = await habitService.getTodayStats(clock.dateKey, clerkUserId);

        if (todayStats.length > 0) {
          const habitPayload = todayStats
            .filter((h) => h.type !== 'vice')
            .map((h, i) => ({
              index: i + 1,
              id: h.id,
              title: h.title,
              alreadyDone: h.isCompletedToday ?? false
            }));

          if (habitPayload.length > 0) {
            const lines = ['🌙 *Fim de dia. Quais hábitos você fez hoje?*', ''];
            for (const h of habitPayload) {
              lines.push(`${h.index}. ${h.alreadyDone ? '✅' : '☐'} ${h.title}`);
            }
            lines.push('', 'Responda com os números. Ex: *1 3*');
            lines.push('Ou *todos* para marcar todos, *nenhum* para pular.');

            await this.enqueueMessage(lines.join('\n'), phoneNumber);
            this.rememberSent(eveningKey);
            this.logger.info({ date: clock.dateKey, phoneNumber }, 'Check-in noturno de hábitos enviado.');

            if (this.conversationService) {
              try {
                await this.conversationService.setSessionPublic(
                  phoneNumber,
                  'habit_checkin',
                  { habits: habitPayload, date: clock.dateKey } as Prisma.JsonObject,
                  120
                );
              } catch (err) {
                this.logger.warn({ err }, 'Falha ao criar sessão habit_checkin pós check-in.');
              }
            }
          }
        }
      } catch (err) {
        this.logger.warn({ err }, 'Falha ao enviar check-in noturno de hábitos.');
      }
    }

    // The active-window check is based on the shared server clock — all users
    // are gated together. Since all users share the same timezone/schedule by
    // design (per spec), this is correct and intentional.
    if (!this.isInsideActiveWindow(clock)) {
      return;
    }

    // ── Upcoming block digest ────────────────────────────────────────────────
    const upcomingBucket = Math.floor(clock.totalMinutes / this.upcomingEveryMinutes);
    const upcomingKey = `upcoming:${clock.dateKey}:${upcomingBucket}:${clerkUserId}`;
    if (!this.wasSent(upcomingKey)) {
      const upcomingDigest = await this.commandService.buildUpcomingBlockDigest({
        date: clock.dateKey,
        withinMinutes: this.upcomingWithinMinutes
      });

      if (upcomingDigest) {
        await this.enqueueMessage(upcomingDigest, phoneNumber);
        this.logger.info({ date: clock.dateKey, bucket: upcomingBucket, phoneNumber }, 'WhatsApp upcoming block enviado.');
      }

      this.rememberSent(upcomingKey);
    }

    // ── Proactivity engine ───────────────────────────────────────────────────
    const proactiveMessage = await this.proactivityEngine.evaluate(clock, null);

    if (proactiveMessage) {
      await this.enqueueMessage(proactiveMessage.message, phoneNumber);

      if (this.conversationService) {
        try {
          await this.conversationService.setSessionPublic(phoneNumber, 'idle', null, 45);
        } catch {
          // Falha silenciosa — não crítico
        }
      }

      this.logger.info(
        { triggerId: proactiveMessage.triggerId, date: clock.dateKey, phoneNumber },
        'WhatsApp proactive trigger disparado.'
      );
    }
  }
  ```

  Note: `buildIntelligentBriefing` and `getTop3ForDate` in `WhatsappBriefingService` take only `dateKey` — they are not user-scoped in this codebase, so no change is needed there.

---

## Task 3 — Rewrite `tick()` to fan-out per user; move vice XP to global block

**File:** `apps/api/src/services/whatsapp-auto-dispatch-service.ts`

- [ ] Replace the entire existing `tick()` method body with the fan-out + global structure:

  ```typescript
  private async tick() {
    try {
      const clock = formatNowToClock(new Date(), this.timezone);
      this.compactSentKeys(clock.dateKey);

      // Fan-out: one iteration per registered user
      const users = await this.prisma.userPhone.findMany();

      for (const user of users) {
        try {
          await this.tickForUser(clock, user.phoneNumber, user.clerkUserId);
        } catch (err) {
          this.logger.error({ err, phoneNumber: user.phoneNumber }, 'Falha no tickForUser.');
        }
      }

      // ── Global operations (not per-user) ────────────────────────────────────
      // Vice XP: runs once at 23h regardless of number of users.
      const viceXpKey = `vice_xp:${clock.dateKey}`;
      if (clock.hour === 23 && !this.wasSent(viceXpKey)) {
        try {
          const habitService = new HabitService(this.prisma);
          await habitService.processViceCleanDayXP(clock.dateKey);
          this.rememberSent(viceXpKey);
          this.logger.info({ date: clock.dateKey }, 'XP de vícios (dias limpos) processado.');
        } catch (err) {
          this.logger.warn({ err }, 'Falha ao processar XP de vícios.');
        }
      }
    } catch (error) {
      this.logger.error({ error }, 'Falha no tick de auto-dispatch WhatsApp.');
    }
  }
  ```

  The vice XP key (`vice_xp:${clock.dateKey}`) has no `clerkUserId` suffix — intentional, it is a global operation. `compactSentKeys` will still correctly clean it because `vice_xp:2026-04-04` contains the dateKey.

  > **Behavior change:** Vice XP processing is no longer inside the `isInsideActiveWindow` guard (it was previously gated because it lived inside the old single `tick()` after the active-window check). It now runs unconditionally at `clock.hour === 23`. This is intentional — vice XP should always process at 23h regardless of active window settings.

---

## Task 4 — Remove `env.DEFAULT_PHONE_NUMBER` and `env.WHATSAPP_CLERK_USER_ID` from config.ts

**File:** `apps/api/src/config.ts`

- [ ] Remove these two lines from `envSchema`:

  ```typescript
  DEFAULT_PHONE_NUMBER: z.string().min(8),
  WHATSAPP_CLERK_USER_ID: z.string().default('legacy'),
  ```

  After the edit, `envSchema` must no longer reference either field. The `env` object (result of `envSchema.parse(process.env)`) will automatically drop both keys.

- [ ] Verify the file compiles cleanly after the removals:

  ```bash
  cd /path/to/operis && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | head -40
  ```

  Expected: errors only for the remaining `env.DEFAULT_PHONE_NUMBER` / `env.WHATSAPP_CLERK_USER_ID` usages (in webhooks.ts and auto-dispatch-service.ts, now to be fixed in Task 5).

---

## Task 5 — Remove all remaining usages of removed env vars

After Task 4, TypeScript will surface every remaining reference. Fix them all.

### 5a — auto-dispatch-service.ts

- [ ] At this point `enqueueMessage` no longer references `env.DEFAULT_PHONE_NUMBER` (Task 1 already fixed it). Confirm with:

  ```bash
  grep -n "DEFAULT_PHONE_NUMBER\|WHATSAPP_CLERK_USER_ID" \
    apps/api/src/services/whatsapp-auto-dispatch-service.ts
  ```

  Expected output: no lines. If any remain, remove them.

### 5b — webhooks.ts

- [ ] `resolveDispatchRecipient` references `env.DEFAULT_PHONE_NUMBER`. The function will be unused after Task 6 but it still references the removed field, which causes a compile error. Remove the fallback line inside `resolveDispatchRecipient`:

  ```typescript
  // BEFORE
  function resolveDispatchRecipient(body: DispatchRequestBody) {
    const direct = typeof body.to === 'string' ? body.to.trim() : '';
    if (direct.length >= 8) {
      return normalizePhone(direct);
    }

    return normalizePhone(env.DEFAULT_PHONE_NUMBER);  // <-- remove this
  }
  ```

  Replace the whole function body so it returns only the direct value (or empty string — it will be removed entirely in Task 6 anyway):

  ```typescript
  function resolveDispatchRecipient(body: DispatchRequestBody) {
    const direct = typeof body.to === 'string' ? body.to.trim() : '';
    return direct.length >= 8 ? normalizePhone(direct) : '';
  }
  ```

  This keeps the file compilable while Task 6 is being applied.

### 5c — Full codebase grep

- [ ] Confirm no other files reference these env vars:

  ```bash
  grep -rn "DEFAULT_PHONE_NUMBER\|WHATSAPP_CLERK_USER_ID" apps/api/src/
  ```

  Expected output: no lines. Fix any stragglers found.

---

## Task 6 — Fan-out manual dispatch routes in webhooks.ts

**File:** `apps/api/src/routes/webhooks.ts`

The four manual dispatch routes currently call `resolveDispatchRecipient()` to pick a single recipient. Replace each route to fan-out to all registered `UserPhone` records instead.

### 6a — `/dispatch/morning`

- [ ] Replace the route handler body (keep auth guard and schema parse, change the send logic):

  ```typescript
  app.post('/webhooks/whatsapp/dispatch/morning', async (request, reply) => {
    try {
      assertWebhookSecret(request.headers['x-webhook-secret']);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized webhook secret' });
    }

    const parsed = morningDispatchSchema.parse(request.body ?? {});
    const users = await prisma.userPhone.findMany();
    let totalSent = 0;

    for (const user of users) {
      const messages: string[] = [];

      const morning = await commandService.buildMorningBriefing({
        date: parsed.date,
        workspaceId: parsed.workspaceId
      });
      messages.push(morning);

      if (parsed.includeDueDigest) {
        const dueDigest = await commandService.buildDueReminderDigest({ date: parsed.date });
        if (dueDigest) messages.push(dueDigest);
      }

      if (parsed.includeFollowupDigest) {
        const followupDigest = await commandService.buildWaitingFollowupDigest({ date: parsed.date });
        if (followupDigest) messages.push(followupDigest);
      }

      if (parsed.includeUpcomingDigest) {
        const upcomingDigest = await commandService.buildUpcomingBlockDigest({
          date: parsed.date,
          withinMinutes: parsed.upcomingWithinMinutes
        });
        if (upcomingDigest) messages.push(upcomingDigest);
      }

      for (const message of messages) {
        await publishEvent(queueNames.sendWhatsappMessage, { to: user.phoneNumber, message });
      }
      totalSent += messages.length;
    }

    return reply.code(202).send({ ok: true, users: users.length, sent: totalSent });
  });
  ```

### 6b — `/dispatch/due-dates`

- [ ] Replace handler body:

  ```typescript
  app.post('/webhooks/whatsapp/dispatch/due-dates', async (request, reply) => {
    try {
      assertWebhookSecret(request.headers['x-webhook-secret']);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized webhook secret' });
    }

    const parsed = dueDispatchSchema.parse(request.body ?? {});
    const users = await prisma.userPhone.findMany();
    let totalSent = 0;

    for (const user of users) {
      const digest = await commandService.buildDueReminderDigest({
        date: parsed.date,
        daysBefore: parsed.daysBefore
      });
      if (digest) {
        await publishEvent(queueNames.sendWhatsappMessage, { to: user.phoneNumber, message: digest });
        totalSent++;
      }
    }

    return reply.code(202).send({ ok: true, users: users.length, sent: totalSent });
  });
  ```

### 6c — `/dispatch/followups`

- [ ] Replace handler body:

  ```typescript
  app.post('/webhooks/whatsapp/dispatch/followups', async (request, reply) => {
    try {
      assertWebhookSecret(request.headers['x-webhook-secret']);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized webhook secret' });
    }

    const users = await prisma.userPhone.findMany();
    let totalSent = 0;

    for (const user of users) {
      const digest = await commandService.buildWaitingFollowupDigest();
      if (digest) {
        await publishEvent(queueNames.sendWhatsappMessage, { to: user.phoneNumber, message: digest });
        totalSent++;
      }
    }

    return reply.code(202).send({ ok: true, users: users.length, sent: totalSent });
  });
  ```

  Note: `followupDispatchSchema` parse is no longer needed since `to` is the only field it had. You may remove the `parsed` variable from this route. The schema definition itself can remain in place (it does no harm).

### 6d — `/dispatch/upcoming-blocks`

- [ ] Replace handler body:

  ```typescript
  app.post('/webhooks/whatsapp/dispatch/upcoming-blocks', async (request, reply) => {
    try {
      assertWebhookSecret(request.headers['x-webhook-secret']);
    } catch {
      return reply.code(401).send({ error: 'Unauthorized webhook secret' });
    }

    const parsed = upcomingDispatchSchema.parse(request.body ?? {});
    const users = await prisma.userPhone.findMany();
    let totalSent = 0;

    for (const user of users) {
      const digest = await commandService.buildUpcomingBlockDigest({
        date: parsed.date,
        withinMinutes: parsed.withinMinutes
      });
      if (digest) {
        await publishEvent(queueNames.sendWhatsappMessage, { to: user.phoneNumber, message: digest });
        totalSent++;
      }
    }

    return reply.code(202).send({ ok: true, users: users.length, sent: totalSent });
  });
  ```

### 6e — Clean up `resolveDispatchRecipient` and `DispatchRequestBody`

- [ ] Remove the `resolveDispatchRecipient` function entirely (it is now unused).
- [ ] Remove the `DispatchRequestBody` type if it is only used by `resolveDispatchRecipient`.
- [ ] Remove the `to` field from `dispatchBaseSchema` if you want a clean schema (optional — leaving it causes no harm since it is simply ignored):

  ```typescript
  // Optional cleanup: remove to from dispatchBaseSchema
  const dispatchBaseSchema = z.object({});
  ```

  Or simply leave `dispatchBaseSchema` and `to` as-is — the field will be silently ignored by all routes.

---

## Task 7 — Final compile check

- [ ] Run the TypeScript compiler across the API package:

  ```bash
  cd /path/to/operis && npx tsc --noEmit -p apps/api/tsconfig.json 2>&1
  ```

  Expected: zero errors. Fix any remaining issues before proceeding.

- [ ] Confirm no runtime import of removed env vars anywhere in the build:

  ```bash
  grep -rn "DEFAULT_PHONE_NUMBER\|WHATSAPP_CLERK_USER_ID" apps/api/src/
  ```

  Expected: no output.

---

## Task 8 — Smoke test with curl

Run all verification steps against a running local server (`npm run dev` or equivalent). Replace `YOUR_SECRET` with the value of `WHATSAPP_WEBHOOK_SECRET` in your `.env` (or omit the header if not set).

### 8a — Seed check: confirm at least one UserPhone exists

- [ ] ```bash
  # Connect to local DB and count rows
  psql "$DATABASE_URL" -c "SELECT phone_number, clerk_user_id FROM user_phones LIMIT 5;"
  ```

  Expected: at least one row. If zero rows, run the SP1/SP2 seed before continuing.

### 8b — Manual morning dispatch

- [ ] ```bash
  curl -s -X POST http://localhost:3000/webhooks/whatsapp/dispatch/morning \
    -H "Content-Type: application/json" \
    -H "x-webhook-secret: YOUR_SECRET" \
    -d '{"date": "2026-04-04"}' | jq .
  ```

  Expected response shape:
  ```json
  { "ok": true, "users": 1, "sent": 3 }
  ```

  `users` equals the number of `UserPhone` rows; `sent` is the total messages enqueued across all users.

### 8c — Manual due-dates dispatch

- [ ] ```bash
  curl -s -X POST http://localhost:3000/webhooks/whatsapp/dispatch/due-dates \
    -H "Content-Type: application/json" \
    -H "x-webhook-secret: YOUR_SECRET" \
    -d '{"date": "2026-04-04"}' | jq .
  ```

  Expected: `{ "ok": true, "users": N, "sent": N_or_0 }`.

### 8d — Manual followups dispatch

- [ ] ```bash
  curl -s -X POST http://localhost:3000/webhooks/whatsapp/dispatch/followups \
    -H "Content-Type: application/json" \
    -H "x-webhook-secret: YOUR_SECRET" \
    -d '{}' | jq .
  ```

  Expected: `{ "ok": true, "users": N, "sent": N_or_0 }`.

### 8e — Manual upcoming-blocks dispatch

- [ ] ```bash
  curl -s -X POST http://localhost:3000/webhooks/whatsapp/dispatch/upcoming-blocks \
    -H "Content-Type: application/json" \
    -H "x-webhook-secret: YOUR_SECRET" \
    -d '{"withinMinutes": 30}' | jq .
  ```

  Expected: `{ "ok": true, "users": N, "sent": N_or_0 }`.

### 8f — Verify auto-dispatch tick in logs

- [ ] Restart the server and wait 60 seconds. Inspect logs:

  ```bash
  # In the server console, look for lines like:
  # "WhatsApp briefing matinal enviado." with phoneNumber field
  # "tickForUser" error lines should NOT appear
  ```

  If the morning time has already passed today, change `WHATSAPP_MORNING_TIME` in `.env` to `00:00` temporarily so the morning briefing fires on next tick.

### 8g — Verify sentKey namespacing

- [ ] Add a temporary log line at the top of `tickForUser` to confirm `clerkUserId` flows correctly:

  ```typescript
  this.logger.info({ phoneNumber, clerkUserId, dateKey: clock.dateKey }, '[DEBUG] tickForUser called');
  ```

  Restart and check logs show the correct per-user `clerkUserId`. Remove the log line after verification.

---

## Task 9 — Deploy and clean up env vars

> **Important:** `DEFAULT_PHONE_NUMBER` must stay in `.env` — the worker package (`apps/worker/src/handlers.ts`) still declares and uses it for block-start/block-end/followup messages. Only `apps/api/src/config.ts` drops it (already done in Task 4). Do NOT remove `DEFAULT_PHONE_NUMBER` from `.env` or from `apps/worker/`.

- [ ] Remove `WHATSAPP_CLERK_USER_ID` from `.env` (the API no longer declares it and the worker never used it):

  ```bash
  grep -rn "WHATSAPP_CLERK_USER_ID" . --include="*.env*"
  ```

  Remove every occurrence found in `.env`, `.env.example`, `.env.template` etc.

- [ ] Confirm `DEFAULT_PHONE_NUMBER` is still present in `.env` for the worker:

  ```bash
  grep "DEFAULT_PHONE_NUMBER" .env
  ```

  Expected: the line is still there.

- [ ] Before deploying to production, confirm the production `UserPhone` table has at least one row seeded — otherwise `tick()` will process zero users and no messages will be sent:

  ```bash
  psql "$DATABASE_URL" -c "SELECT count(*) FROM user_phones;"
  ```

  If zero rows, run the SP1 seed script first: `cd apps/api && npm run seed`.

- [ ] Deploy to production (following your existing deployment process).

---

## Rollback notes

If SP3 must be reverted:

1. Revert the three changed files to their pre-SP3 state via git.
2. Restore `DEFAULT_PHONE_NUMBER` and `WHATSAPP_CLERK_USER_ID` in `.env`.
3. Redeploy.

The `UserPhone` table and SP1/SP2 changes are unaffected and do not need to be rolled back.
