import { EventPayloadByQueue, queueNames } from '@execution-os/shared';

import { prisma } from './db.js';
import { env } from './config.js';
import { sendWhatsappMessage } from './evolution-client.js';
import { GamificationService } from './gamification-service.js';

const gamificationService = new GamificationService(prisma);

function formatHour(date: Date) {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function handleScheduleBlockStart(payload: EventPayloadByQueue[typeof queueNames.scheduleBlockStart]) {
  const item = await prisma.dayPlanItem.findUnique({
    where: { id: payload.dayPlanItemId },
    include: { task: true }
  });

  if (!item) {
    return;
  }

  const title = item.task?.title ?? 'Bloco fixo';
  const message = `Começou: ${title} (até ${formatHour(item.endTime)})`;

  await prisma.whatsappEvent.create({
    data: {
      direction: 'out',
      messageContent: message,
      relatedTaskId: item.taskId
    }
  });

  await sendWhatsappMessage(env.DEFAULT_PHONE_NUMBER, message);
}

async function handleScheduleBlockEnd(payload: EventPayloadByQueue[typeof queueNames.scheduleBlockEnd]) {
  const item = await prisma.dayPlanItem.findUnique({
    where: { id: payload.dayPlanItemId },
    include: { task: true }
  });

  if (!item || !item.task) {
    return;
  }

  const message = `Você concluiu: ${item.task.title}?\n1 Fiz ${item.id}\n2 Não fiz ${item.id}\n3 Adiar ${item.id}\n4 Reagendar ${item.id}`;

  await prisma.whatsappEvent.create({
    data: {
      direction: 'out',
      messageContent: message,
      relatedTaskId: item.taskId
    }
  });

  await sendWhatsappMessage(env.DEFAULT_PHONE_NUMBER, message);

  setTimeout(async () => {
    const current = await prisma.dayPlanItem.findUnique({
      where: { id: item.id }
    });

    if (!current || current.confirmationState !== 'pending') {
      return;
    }

    const reminder = `Lembrete: confirme a execução de ${item.task?.title}.`;

    await prisma.whatsappEvent.create({
      data: {
        direction: 'out',
        messageContent: reminder,
        relatedTaskId: item.taskId
      }
    });

    await sendWhatsappMessage(env.DEFAULT_PHONE_NUMBER, reminder);
  }, env.FOLLOWUP_REMINDER_DELAY_MINUTES * 60 * 1000);
}

async function handleSendWhatsappMessage(payload: EventPayloadByQueue[typeof queueNames.sendWhatsappMessage]) {
  await prisma.whatsappEvent.create({
    data: {
      direction: 'out',
      messageContent: payload.message,
      relatedTaskId: payload.relatedTaskId
    }
  });

  await sendWhatsappMessage(payload.to, payload.message);
}

async function applyCompletionFromReply(dayPlanItemId: string) {
  const item = await prisma.dayPlanItem.update({
    where: { id: dayPlanItemId },
    data: {
      confirmationState: 'confirmed_done'
    }
  });

  if (!item.taskId) {
    return;
  }

  const task = await prisma.task.findUnique({ where: { id: item.taskId } });
  if (!task) {
    return;
  }

  await prisma.task.update({
    where: { id: item.taskId },
    data: {
      status: 'feito',
      completedAt: new Date()
    }
  });

  await prisma.executionEvent.create({
    data: {
      taskId: item.taskId,
      eventType: 'completed'
    }
  });

  const result = task.fixedTimeEnd && new Date() <= task.fixedTimeEnd ? 'on_time' : 'late';
  await gamificationService.applyResult(result);
}

async function applyNotDoneFromReply(dayPlanItemId: string, postponed: boolean) {
  const item = await prisma.dayPlanItem.update({
    where: { id: dayPlanItemId },
    data: {
      confirmationState: 'confirmed_not_done'
    }
  });

  if (!item.taskId) {
    return;
  }

  await prisma.executionEvent.create({
    data: {
      taskId: item.taskId,
      eventType: postponed ? 'delayed' : 'failed'
    }
  });

  if (postponed) {
    await prisma.task.update({
      where: { id: item.taskId },
      data: {
        status: 'backlog'
      }
    });
    await gamificationService.applyResult('postponed');
  } else {
    await gamificationService.applyResult('not_confirmed');
  }
}

async function handleProcessWhatsappReply(payload: EventPayloadByQueue[typeof queueNames.processWhatsappReply]) {
  await prisma.whatsappEvent.create({
    data: {
      direction: 'in',
      messageContent: payload.message
    }
  });

  const match = payload.message.trim().match(/^(1|2|3|4)\s+([\w-]+)$/);

  if (!match) {
    return;
  }

  const option = match[1];
  const dayPlanItemId = match[2];

  if (option === '1') {
    await applyCompletionFromReply(dayPlanItemId);
    return;
  }

  if (option === '3') {
    await applyNotDoneFromReply(dayPlanItemId, true);
    return;
  }

  if (option === '2') {
    await applyNotDoneFromReply(dayPlanItemId, false);
    return;
  }

  if (option === '4') {
    await sendWhatsappMessage(
      payload.from,
      'Envie: reagendar <taskId> HH:mm para reagendar a tarefa.'
    );
  }
}

async function handleUpdateGamification(payload: EventPayloadByQueue[typeof queueNames.updateGamification]) {
  await gamificationService.applyResult(payload.result);
}

async function handleWaitingFollowupCheck(payload: EventPayloadByQueue[typeof queueNames.waitingFollowupCheck]) {
  const task = await prisma.task.findUnique({
    where: { id: payload.taskId }
  });

  if (!task || !task.waitingOnPerson) {
    return;
  }

  const intervalLabel =
    payload.waitingPriority === 'alta'
      ? 'diário'
      : payload.waitingPriority === 'media'
        ? 'a cada 3 dias'
        : 'a cada 7 dias';

  const message = `Follow-up (${intervalLabel}): cobrar ${task.waitingOnPerson} sobre \"${task.title}\".`;

  await prisma.whatsappEvent.create({
    data: {
      direction: 'out',
      messageContent: message,
      relatedTaskId: task.id
    }
  });

  await sendWhatsappMessage(env.DEFAULT_PHONE_NUMBER, message);
}

export async function dispatchQueueEvent(queue: string, payload: unknown) {
  switch (queue) {
    case queueNames.scheduleBlockStart:
      return handleScheduleBlockStart(
        payload as EventPayloadByQueue[typeof queueNames.scheduleBlockStart]
      );
    case queueNames.scheduleBlockEnd:
      return handleScheduleBlockEnd(payload as EventPayloadByQueue[typeof queueNames.scheduleBlockEnd]);
    case queueNames.sendWhatsappMessage:
      return handleSendWhatsappMessage(
        payload as EventPayloadByQueue[typeof queueNames.sendWhatsappMessage]
      );
    case queueNames.processWhatsappReply:
      return handleProcessWhatsappReply(
        payload as EventPayloadByQueue[typeof queueNames.processWhatsappReply]
      );
    case queueNames.updateGamification:
      return handleUpdateGamification(
        payload as EventPayloadByQueue[typeof queueNames.updateGamification]
      );
    case queueNames.waitingFollowupCheck:
      return handleWaitingFollowupCheck(
        payload as EventPayloadByQueue[typeof queueNames.waitingFollowupCheck]
      );
    default:
      return;
  }
}
