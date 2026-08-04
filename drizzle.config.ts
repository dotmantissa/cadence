import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit reads DATABASE_URL from the shell env. For local pushes it is
 * sourced from .env.local (server-side only) — never committed, never public.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
