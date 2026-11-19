import { z } from 'zod';

// Local development reads .env. In Docker (and in CI) the file is absent and
// the variables come from the process environment, so a missing file is fine.
try {
  process.loadEnvFile();
} catch {
  // no .env file: nothing to load
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  SEED_KEY_A: z.string().optional(),
  SEED_KEY_B: z.string().optional(),
});

export const config = envSchema.parse(process.env);
