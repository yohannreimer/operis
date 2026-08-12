import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Prisma schema contracts', () => {
  it('maps the execution session task relation to the migrated snake_case column', () => {
    const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
    const executionSession = schema.match(/model ExecutionSession \{([\s\S]*?)\n\}/)?.[1];

    expect(executionSession).toBeDefined();
    expect(executionSession).toMatch(/taskId\s+String\?\s+@map\("task_id"\)/);
  });
});
