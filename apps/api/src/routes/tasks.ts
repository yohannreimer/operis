import { FastifyInstance } from 'fastify';
import {
  TaskEnergy,
  TaskExecutionKind,
  TaskHorizon,
  TaskRestrictionStatus,
  TaskStatus,
  TaskType,
  WaitingType
} from '@prisma/client';
import { z } from 'zod';

import { TaskService } from '../services/task-service.js';

const executableTitleSchema = z
  .string()
  .min(3)
  .refine((value) => value.trim().split(/\s+/).length >= 2, 'Use verbo + objeto no título da tarefa.');

const taskBodyBaseSchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  title: executableTitleSchema,
  description: z.string().optional().nullable(),
  definitionOfDone: z.string().max(280).optional().nullable(),
  isMultiBlock: z.boolean().optional(),
  multiBlockGoalMinutes: z.number().int().positive().optional().nullable(),
  taskType: z.nativeEnum(TaskType).optional(),
  energyLevel: z.nativeEnum(TaskEnergy).optional(),
  executionKind: z.nativeEnum(TaskExecutionKind).optional(),
  horizon: z.nativeEnum(TaskHorizon).optional(),
  priority: z.number().min(1).max(5).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  estimatedMinutes: z.number().int().positive().optional().nullable(),
  fixedTimeStart: z.string().datetime().optional().nullable(),
  fixedTimeEnd: z.string().datetime().optional().nullable(),
  windowStart: z.string().datetime().optional().nullable(),
  windowEnd: z.string().datetime().optional().nullable(),
  waitingOnPerson: z.string().optional().nullable(),
  waitingType: z.nativeEnum(WaitingType).optional().nullable(),
  waitingPriority: z.enum(['alta', 'media', 'baixa']).optional().nullable(),
  waitingDueDate: z.string().datetime().optional().nullable()
});

const taskCreateSchema = taskBodyBaseSchema
  .extend({
    definitionOfDone: z.string().min(3).max(280),
    taskType: z.nativeEnum(TaskType),
    energyLevel: z.nativeEnum(TaskEnergy),
    executionKind: z.nativeEnum(TaskExecutionKind),
    estimatedMinutes: z.number().int().positive()
  })
  .superRefine((payload, context) => {
    const waitingPerson = payload.waitingOnPerson?.trim();
    if (waitingPerson) {
      if (!payload.waitingType) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['waitingType'],
          message: 'Informe o tipo de dependência externa.'
        });
      }
      if (!payload.waitingDueDate) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['waitingDueDate'],
          message: 'Informe a data limite da dependência externa.'
        });
      }
    }

    if (payload.isMultiBlock && !payload.definitionOfDone?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['definitionOfDone'],
        message: 'Tarefa multiblock exige critério de término (definição de pronto).'
      });
    }
  });

const taskUpdateSchema = taskBodyBaseSchema
  .partial()
  .extend({
    status: z.nativeEnum(TaskStatus).optional(),
    title: executableTitleSchema.optional()
  })
  .superRefine((payload, context) => {
    const waitingPerson = payload.waitingOnPerson?.trim();
    if (waitingPerson) {
      if (!payload.waitingType) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['waitingType'],
          message: 'Informe o tipo de dependência externa.'
        });
      }
      if (!payload.waitingDueDate) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['waitingDueDate'],
          message: 'Informe a data limite da dependência externa.'
        });
      }
    }
  });

const subtaskCreateSchema = z.object({
  title: z.string().min(1)
});

const subtaskUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    status: z.enum(['backlog', 'feito']).optional()
  })
  .refine((payload) => payload.title !== undefined || payload.status !== undefined, {
    message: 'Informe ao menos um campo para atualizar.'
  });

const restrictionCreateSchema = z.object({
  title: z.string().min(1),
  detail: z.string().optional().nullable()
});

const restrictionUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    detail: z.string().optional().nullable(),
    status: z.nativeEnum(TaskRestrictionStatus).optional()
  })
  .refine((payload) => payload.title !== undefined || payload.detail !== undefined || payload.status !== undefined, {
    message: 'Informe ao menos um campo para atualizar.'
  });

export function registerTaskRoutes(app: FastifyInstance, taskService: TaskService) {
  app.get('/tasks', async (request) => {
    const query = z
      .object({
        workspaceId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        status: z.nativeEnum(TaskStatus).optional(),
        horizon: z.nativeEnum(TaskHorizon).optional(),
        waitingOnly: z.coerce.boolean().optional(),
        restrictedOnly: z.coerce.boolean().optional()
      })
      .parse(request.query);

    return taskService.list(query);
  });

  app.get('/tasks/waiting-radar', async (request) => {
    const query = z
      .object({
        workspaceId: z.string().uuid().optional()
      })
      .parse(request.query);

    return taskService.getWaitingRadar(query);
  });

  app.post('/tasks', async (request, reply) => {
    const payload = taskCreateSchema.parse(request.body);
    const task = await taskService.create(payload);
    return reply.code(201).send(task);
  });

  app.patch('/tasks/:taskId', async (request) => {
    const params = z.object({ taskId: z.string().uuid() }).parse(request.params);
    const payload = taskUpdateSchema.parse(request.body);

    return taskService.update(params.taskId, payload);
  });

  app.post('/tasks/:taskId/complete', async (request) => {
    const params = z.object({ taskId: z.string().uuid() }).parse(request.params);
    const query = z
      .object({
        strictMode: z.coerce.boolean().optional()
      })
      .parse(request.query);

    return taskService.complete(params.taskId, {
      strictMode: query.strictMode ?? false
    });
  });

  app.post('/tasks/:taskId/postpone', async (request) => {
    const params = z.object({ taskId: z.string().uuid() }).parse(request.params);
    return taskService.postpone(params.taskId);
  });

  app.post('/tasks/:taskId/dependencies', async (request, reply) => {
    const params = z.object({ taskId: z.string().uuid() }).parse(request.params);
    const body = z.object({ dependsOnTaskId: z.string().uuid() }).parse(request.body);

    const dependency = await taskService.addDependency(params.taskId, body.dependsOnTaskId);

    return reply.code(201).send(dependency);
  });

  app.post('/tasks/:taskId/waiting-followup', async (request) => {
    const params = z.object({ taskId: z.string().uuid() }).parse(request.params);
    const payload = z
      .object({
        note: z.string().max(220).optional(),
        source: z.enum(['manual', 'auto']).optional(),
        triggerQueue: z.boolean().optional()
      })
      .optional()
      .parse(request.body);

    return taskService.registerWaitingFollowup(params.taskId, payload);
  });

  app.post('/tasks/:taskId/waiting-followup/schedule', async (request) => {
    const params = z.object({ taskId: z.string().uuid() }).parse(request.params);
    return taskService.scheduleWaitingFollowup(params.taskId);
  });

  app.get('/tasks/:taskId/multiblock', async (request) => {
    const params = z.object({ taskId: z.string().uuid() }).parse(request.params);
    return taskService.getMultiBlockProgress(params.taskId);
  });

  app.get('/tasks/:taskId/subtasks', async (request) => {
    const params = z.object({ taskId: z.string().uuid() }).parse(request.params);
    return taskService.listSubtasks(params.taskId);
  });

  app.post('/tasks/:taskId/subtasks', async (request, reply) => {
    const params = z.object({ taskId: z.string().uuid() }).parse(request.params);
    const payload = subtaskCreateSchema.parse(request.body);

    const subtask = await taskService.createSubtask(params.taskId, payload.title);
    return reply.code(201).send(subtask);
  });

  app.patch('/subtasks/:subtaskId', async (request) => {
    const params = z.object({ subtaskId: z.string().uuid() }).parse(request.params);
    const payload = subtaskUpdateSchema.parse(request.body);

    return taskService.updateSubtask(params.subtaskId, payload);
  });

  app.delete('/subtasks/:subtaskId', async (request) => {
    const params = z.object({ subtaskId: z.string().uuid() }).parse(request.params);
    return taskService.removeSubtask(params.subtaskId);
  });

  app.get('/tasks/:taskId/restrictions', async (request) => {
    const params = z.object({ taskId: z.string().uuid() }).parse(request.params);
    return taskService.listRestrictions(params.taskId);
  });

  app.post('/tasks/:taskId/restrictions', async (request, reply) => {
    const params = z.object({ taskId: z.string().uuid() }).parse(request.params);
    const payload = restrictionCreateSchema.parse(request.body);

    const restriction = await taskService.createRestriction(params.taskId, payload);
    return reply.code(201).send(restriction);
  });

  app.patch('/task-restrictions/:restrictionId', async (request) => {
    const params = z.object({ restrictionId: z.string().uuid() }).parse(request.params);
    const payload = restrictionUpdateSchema.parse(request.body);

    return taskService.updateRestriction(params.restrictionId, payload);
  });

  app.delete('/task-restrictions/:restrictionId', async (request) => {
    const params = z.object({ restrictionId: z.string().uuid() }).parse(request.params);
    return taskService.removeRestriction(params.restrictionId);
  });

  app.delete('/tasks/:taskId', async (request) => {
    const params = z.object({ taskId: z.string().uuid() }).parse(request.params);
    return taskService.remove(params.taskId);
  });

  app.get('/tasks/:taskId/history', async (request) => {
    const params = z.object({ taskId: z.string().uuid() }).parse(request.params);
    return taskService.getHistory(params.taskId);
  });

  app.post('/tasks/archive-completed', async () => {
    const archivedCount = await taskService.archiveCompletedOlderThan24Hours();
    return { archivedCount };
  });
}
