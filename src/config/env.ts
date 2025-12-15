import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_DOCS_USERNAME: z.string().optional(),
  API_DOCS_PASSWORD: z.string().optional(),
  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // ResellerClub
  RESELLERCLUB_AUTH_USERID: z.string().optional(),
  RESELLERCLUB_API_KEY: z.string().optional(),
  RESELLERCLUB_SANDBOX: z.string().optional().transform(val => val !== 'false').default('true'),
  // Automation Service
  AUTOMATION_SERVICE_URL: z.string().url().default('http://localhost:3002'),
  AUTOMATION_SERVICE_API_KEY: z.string().min(32, 'AUTOMATION_SERVICE_API_KEY must be at least 32 characters'),
});

type Env = z.infer<typeof envSchema>;

let env: Env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    const missing = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Environment validation failed:\n${missing}`);
  }
  throw error;
}

export { env };

