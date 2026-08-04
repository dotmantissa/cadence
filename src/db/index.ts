import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Server-only Neon client. `server-only` makes the build fail loudly if this
 * ever gets imported into a client component, so DATABASE_URL can never leak
 * into the browser bundle.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Add it to .env.local (server-side).");
}

const sql = neon(url);
export const db = drizzle(sql, { schema });
export { schema };
