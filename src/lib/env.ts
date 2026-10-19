import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** 32+ char secret used to sign sessions/OAuth state and encrypt stored tokens. */
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  ALLOW_SIGNUP: z.enum(["true", "false"]).default("false"),
  CRON_SECRET: z.string().optional(),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  /** Set to "false" only for local testing with curl — never in production. */
  TWILIO_VALIDATE_SIGNATURE: z.enum(["true", "false"]).default("true"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5-5"),
});

export const env = schema.parse(process.env);

export const features = {
  twilio: Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN),
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  ai: Boolean(env.ANTHROPIC_API_KEY),
};
