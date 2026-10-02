import "server-only";
import { neon, types } from "@neondatabase/serverless";
// Preserve PostgreSQL microseconds for optimistic-edit comparisons.
types.setTypeParser(1184, (value) => value);
types.setTypeParser(1082, (value) => value);
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error("Configure the Neon DATABASE_URL before using the app.");
  const sql = neon(url);
  return (await sql.query(text, params)) as T[];
}
