import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyToken } from '@clerk/backend';
import { checkPrymeiraProductAccess } from '../services/prymeira-access-service.js';
import { requireAuth } from './auth.js';

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn()
}));

vi.mock('../config.js', () => ({
  env: {
    CLERK_SECRET_KEY: 'sk_test',
    PRYMEIRA_PRODUCT_KEY: 'operis'
  }
}));

vi.mock('../services/prymeira-access-service.js', () => ({
  checkPrymeiraProductAccess: vi.fn()
}));

function buildReply() {
  const send = vi.fn();
  const status = vi.fn(() => ({ send }));
  return { status, send };
}

describe('requireAuth', () => {
  beforeEach(() => {
    vi.mocked(verifyToken).mockResolvedValue({ sub: 'user_123' } as never);
  });

  it('keeps protected Operis routes blocked when Hub denies product access', async () => {
    vi.mocked(checkPrymeiraProductAccess).mockResolvedValue({
      allowed: false,
      reason: 'no_entitlement',
      accessUrl: 'https://hub.prymeiradigital.com.br/acesso-negado?product_key=operis&reason=no_entitlement'
    });
    const reply = buildReply();
    const request = {
      routeOptions: { url: '/workspaces' },
      url: '/workspaces',
      headers: { authorization: 'Bearer clerk-token' }
    } as unknown as FastifyRequest;

    await requireAuth(request, reply as unknown as FastifyReply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'Acesso não liberado pela Prymeira Account.',
      productAccessRequired: true,
      productKey: 'operis',
      reason: 'no_entitlement',
      accessUrl: 'https://hub.prymeiradigital.com.br/acesso-negado?product_key=operis&reason=no_entitlement'
    });
  });
});
