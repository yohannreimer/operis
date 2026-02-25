import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { DayPlanService } from '../services/day-plan-service.js';

function toDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00.000Z`).toISOString();
}

export function registerRecurringBlockRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  dayPlanService: DayPlanService
) {
  app.get('/recurring-blocks', async () => {
    return prisma.recurringBlock.findMany({
      where: {
        active: true
      },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }]
    });
  });

  app.post('/recurring-blocks', async (request, reply) => {
    const payload = z
      .object({
        title: z.string().min(2),
        weekday: z.number().int().min(0).max(6),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
        active: z.boolean().optional()
      })
      .parse(request.body);

    const created = await prisma.recurringBlock.create({
      data: {
        title: payload.title,
        weekday: payload.weekday,
        startTime: payload.startTime,
        endTime: payload.endTime,
        active: payload.active ?? true
      }
    });

    return reply.code(201).send(created);
  });

  app.post('/recurring-blocks/apply/:date', async (request) => {
    const params = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
      .parse(request.params);

    const date = new Date(`${params.date}T00:00:00.000Z`);
    const weekday = date.getUTCDay();

    const blocks = await prisma.recurringBlock.findMany({
      where: {
        weekday,
        active: true
      },
      orderBy: {
        startTime: 'asc'
      }
    });

    const createdItems = [];

    for (const block of blocks) {
      const item = await dayPlanService.addItem({
        date: params.date,
        startTime: toDateTime(params.date, block.startTime),
        endTime: toDateTime(params.date, block.endTime),
        blockType: 'fixed'
      });

      createdItems.push(item);
    }

    return {
      appliedBlocks: createdItems.length,
      items: createdItems
    };
  });
}
