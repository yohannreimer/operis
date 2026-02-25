import { FastifyInstance } from 'fastify';
import { TaskHorizon, TaskStatus } from '@prisma/client';
import { z } from 'zod';

import { TaskService } from '../services/task-service.js';

const taskBodySchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  horizon: z.nativeEnum(TaskHorizon).optional(),
  priority: z.number().min(1).max(5).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  estimatedMinutes: z.number().int().positive().optional().nullable(),
  fixedTimeStart: z.string().datetime().optional().nullable(),
  fixedTimeEnd: z.string().datetime().optional().nullable(),
  windowStart: z.string().datetime().optional().nullable(),
  windowEnd: z.string().datetime().optional().nullable(),
  waitingOnPerson: z.string().optional().nullable(),
  waitingPriority: z.enum(['alta', 'media', 'baixa']).optional().nullable()
});

const taskUpdateSchema = taskBodySchema.partial().extend({
  status: z.nativeEnum(TaskStatus).optional()
});

export function registerTaskRoutes(app: FastifyInstance, taskService: TaskService) {
  app.get('/tasks', async (request) => {
    const query = z
      .object({
        workspaceId: z.string().uuid().optional(),
        projectId: z.string().uuid().optional(),
        status: z.nativeEnum(TaskStatus).optional(),
        horizon: z.nativeEnum(TaskHorizon).optional(),
        waitingOnly: z.coerce.boolean().optional()
      })
      .parse(request.query);

    return taskService.list(query);
  });

  app.post('/tasks', async (request, reply) => {
    const payload = taskBodySchema.parse(request.body);
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
    return taskService.complete(params.taskId);
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
    return taskService.scheduleWaitingFollowup(params.taskId);
  });

  app.post('/tasks/archive-completed', async () => {
    const archivedCount = await taskService.archiveCompletedOlderThan24Hours();
    return { archivedCount };
  });
}
