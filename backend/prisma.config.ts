import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  migrate: {
    async adapter() {
      const url = process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/agentscup';
      const { PrismaPg } = await import('@prisma/adapter-pg');
      return new PrismaPg({ connectionString: url });
    },
  },
});
