import { readdir, readFile } from "node:fs/promises";
import pg from "pg";
import type { Logger } from "./logger.ts";

export type Pool = pg.Pool;

export function createPool(databaseUrl: string): Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 10_000 });
}

const MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url);

// Applies numbered .sql files in order, each in its own transaction, and records them.
// A migration that fails stops the start-up; nothing half-applied is left behind.
export async function migrate(pool: Pool, log: Logger, dir: URL = MIGRATIONS_DIR): Promise<string[]> {
  await pool.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const files = (await readdir(dir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const done = new Set((await pool.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name));
  const applied: string[] = [];

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(new URL(file, dir), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
      await client.query("commit");
      applied.push(file);
      log.info("migration_applied", { file });
    } catch (err) {
      await client.query("rollback");
      throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      client.release();
    }
  }
  return applied;
}
