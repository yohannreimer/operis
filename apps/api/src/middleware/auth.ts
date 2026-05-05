import { verifyToken } from '@clerk/backend';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config.js';

// Routes that bypass auth (webhooks use their own secret validation)
const PUBLIC_ROUTES = new Set(['/health', '/notes/dictation-stream']);
const PUBLIC_PREFIXES = ['/webhooks'];

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const path = request.routeOptions?.url ?? request.url;

  if (PUBLIC_ROUTES.has(path)) return;
  if (PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) return;

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Não autorizado.' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
    (request as AuthenticatedRequest).userId = payload.sub;
  } catch {
    return reply.status(401).send({ error: 'Token inválido ou expirado.' });
  }
}

export interface AuthenticatedRequest extends FastifyRequest {
  userId: string;
}

/** Extracts the authenticated userId from the request. Safe to call after requireAuth. */
export function getUserId(request: FastifyRequest): string {
  const userId = (request as AuthenticatedRequest).userId;
  if (!userId) throw new Error('Não autorizado.');
  return userId;
}
