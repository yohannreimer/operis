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
