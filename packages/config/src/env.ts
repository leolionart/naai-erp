import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.url(),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_URL: z.url().startsWith("postgresql://"),
  REDIS_URL: z.url().startsWith("redis://"),
  OBJECT_STORAGE_ENDPOINT: z.url(),
  OBJECT_STORAGE_BUCKET: z.string().min(1),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  WEBHOOK_SIGNING_SECRET: z.string().min(32),
});

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(input: Record<string, string | undefined>): Environment {
  return environmentSchema.parse(input);
}
