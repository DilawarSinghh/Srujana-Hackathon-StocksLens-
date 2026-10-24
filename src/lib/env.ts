import { z } from "zod";

/**
 * Environment validation.
 *
 * Two schemas:
 *  - publicEnvSchema: variables safe to expose to the browser (NEXT_PUBLIC_*).
 *  - serverEnvSchema: secrets and server/script-only variables. NEVER import
 *    `serverEnv` into client components.
 *
 * Validation runs lazily so that importing a public helper in the browser does
 * not throw because a server-only secret is absent from the client bundle.
 */

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url("NEXT_PUBLIC_SITE_URL must be a valid URL")
    .default("http://localhost:3000"),
});

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required for scripts/server code"),
  GOOGLE_GENERATIVE_AI_API_KEY: z
    .string()
    .min(1, "GOOGLE_GENERATIVE_AI_API_KEY is required"),
  GEMINI_CHAT_MODEL: z.string().min(1, "GEMINI_CHAT_MODEL is required"),
  GEMINI_EMBED_MODEL: z.string().min(1, "GEMINI_EMBED_MODEL is required"),
  EMBED_DIMENSIONS: z.coerce.number().int().positive().default(768),
  FINNHUB_API_KEY: z.string().optional(),
  CRON_SECRET: z.string().min(1, "CRON_SECRET is required").optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function formatError(prefix: string, error: z.ZodError): never {
  const issues = error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  throw new Error(
    `${prefix} environment validation failed:\n${issues}\n\nCheck your .env file against .env.example.`,
  );
}

let _publicEnv: PublicEnv | null = null;
let _serverEnv: ServerEnv | null = null;

/** Validated public env. Safe for client and server. */
export function getPublicEnv(): PublicEnv {
  if (_publicEnv) return _publicEnv;
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  if (!parsed.success) formatError("Public", parsed.error);
  _publicEnv = parsed.data;
  return _publicEnv;
}

/** Validated server/script-only env. NEVER call from client code. */
export function getServerEnv(): ServerEnv {
  if (_serverEnv) return _serverEnv;
  const parsed = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    GEMINI_CHAT_MODEL: process.env.GEMINI_CHAT_MODEL,
    GEMINI_EMBED_MODEL: process.env.GEMINI_EMBED_MODEL,
    EMBED_DIMENSIONS: process.env.EMBED_DIMENSIONS,
    FINNHUB_API_KEY: process.env.FINNHUB_API_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
  });
  if (!parsed.success) formatError("Server", parsed.error);
  _serverEnv = parsed.data;
  return _serverEnv;
}
