export const queueNames = {
  scheduleBlockStart: 'schedule_block_start',
  scheduleBlockEnd: 'schedule_block_end',
  sendWhatsappMessage: 'send_whatsapp_message',
  processWhatsappReply: 'process_whatsapp_reply',
  updateGamification: 'update_gamification',
  waitingFollowupCheck: 'waiting_followup_check'
} as const;

export type QueueName = (typeof queueNames)[keyof typeof queueNames];

export type EventPayloadByQueue = {
  [queueNames.scheduleBlockStart]: {
    dayPlanItemId: string;
    taskId: string | null;
  };
  [queueNames.scheduleBlockEnd]: {
    dayPlanItemId: string;
    taskId: string | null;
  };
  [queueNames.sendWhatsappMessage]: {
    to: string;
    message: string;
    relatedTaskId?: string;
  };
  [queueNames.processWhatsappReply]: {
    from: string;
    message: string;
  };
  [queueNames.updateGamification]: {
    taskId: string;
    result: 'on_time' | 'late' | 'postponed' | 'not_confirmed';
  };
  [queueNames.waitingFollowupCheck]: {
    taskId: string;
    waitingPriority: 'alta' | 'media' | 'baixa';
  };
};

export type EventEnvelope<TQueue extends QueueName = QueueName> = {
  id: string;
  queue: TQueue;
  createdAt: string;
  payload: EventPayloadByQueue[TQueue];
};
