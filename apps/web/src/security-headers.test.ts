import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const nginxConfigPath = resolve(process.cwd(), '../../ops/nginx-web.conf');
const nginxConfig = readFileSync(nginxConfigPath, 'utf8');
const csp = nginxConfig.match(/add_header Content-Security-Policy "([^"]+)"/)?.[1];

describe('production Content Security Policy', () => {
  it('allows the Clerk runtime and protection resources', () => {
    expect(csp).toBeDefined();
    expect(csp).toContain(
      "script-src 'self' https://clerk.prymeiradigital.com.br https://discrete-peacock-45.clerk.accounts.dev https://challenges.cloudflare.com https://*.protect.clerk.com"
    );
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain(
      "frame-src 'self' https://challenges.cloudflare.com https://*.protect.clerk.com"
    );
  });

  it('does not allow arbitrary or inline scripts', () => {
    const scriptSources = csp
      ?.split(';')
      .map((directive) => directive.trim())
      .find((directive) => directive.startsWith('script-src'));

    expect(scriptSources).not.toContain("'unsafe-inline'");
    expect(scriptSources).not.toContain("'unsafe-eval'");
    expect(scriptSources).not.toMatch(/(?:^|\s)https:(?:\s|$)/);
  });
});
