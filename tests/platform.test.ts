// Integration tests: they need a real PostgreSQL (npm run db:dev) and use a throwaway schema per test run.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createLogger } from "../src/platform/logger.ts";
import { migrate, type Pool } from "../src/platform/db.ts";
import { enqueue, deliverDue, backoffMs, MAX_ATTEMPTS, outboxCounts, type Senders } from "../src/platform/outbox.ts";
import { runJob, jobStatuses } from "../src/platform/jobs.ts";

const log = createLogger("error");
const schema = `t_${process.pid}_${Date.now()}`;
let pool: Pool;

before(async () => {
  const url = process.env.DATABASE_URL;
  assert.ok(url, "DATABASE_URL must point at a test PostgreSQL (run: npm run db:dev)");
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query(`create schema ${schema}`);
  await admin.end();
  pool = new pg.Pool({ connectionString: url, max: 4, options: `-c search_path=${schema}` });
  await migrate(pool, log);
});

after(async () => {
  await pool.query("select 1");
  const url = process.env.DATABASE_URL!;
  await pool.end();
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query(`drop schema ${schema} cascade`);
  await admin.end();
});

const okSenders = (sent: string[]): Senders => ({
  email: async (m) => { sent.push(`email:${m.to}`); },
  discord: async (m) => { sent.push(`discord:${m.webhook}`); },
});
const brokenSenders: Senders = {
  email: async () => { throw new Error("smtp down"); },
  discord: async () => { throw new Error("webhook gone"); },
};

test("migrations are idempotent", async () => {
  assert.deepEqual(await migrate(pool, log), []);
});

test("backoff grows and is capped at one hour", () => {
  assert.equal(backoffMs(1), 30_000);
  assert.equal(backoffMs(2), 60_000);
  assert.equal(backoffMs(20), 3_600_000);
});

test("a queued message is sent once and marked sent", async () => {
  await pool.query("delete from outbox");
  const sent: string[] = [];
  await enqueue(pool, { channel: "email", to: "a@example.com", subject: "s", text: "t" });
  await enqueue(pool, { channel: "discord", webhook: "events", content: "hi" });
  const r = await deliverDue(pool, okSenders(sent), async () => {}, log);
  assert.deepEqual(r, { sent: 2, retried: 0, dead: 0 });
  assert.deepEqual(sent.sort(), ["discord:events", "email:a@example.com"]);
  assert.deepEqual(await deliverDue(pool, okSenders(sent), async () => {}, log), { sent: 0, retried: 0, dead: 0 });
});

test("a failing message is retried later, recorded, and alerts the owner when given up", async () => {
  await pool.query("delete from outbox");
  const alerts: string[] = [];
  const id = await enqueue(pool, { channel: "discord", webhook: "events", content: "x" });

  const first = await deliverDue(pool, brokenSenders, async (t) => { alerts.push(t); }, log);
  assert.deepEqual(first, { sent: 0, retried: 1, dead: 0 });
  let row = (await pool.query("select status, attempts, last_error, next_attempt_at > now() as later from outbox where id=$1", [id])).rows[0];
  assert.equal(row.status, "pending");
  assert.equal(row.attempts, 1);
  assert.equal(row.last_error, "webhook gone");
  assert.equal(row.later, true);
  assert.equal(alerts.length, 0);

  // Fast-forward to the last attempt and force it due.
  await pool.query("update outbox set attempts=$2, next_attempt_at=now() where id=$1", [id, MAX_ATTEMPTS - 1]);
  const last = await deliverDue(pool, brokenSenders, async (t) => { alerts.push(t); }, log);
  assert.deepEqual(last, { sent: 0, retried: 0, dead: 1 });
  row = (await pool.query("select status from outbox where id=$1", [id])).rows[0];
  assert.equal(row.status, "dead");
  assert.equal(alerts.length, 1);
  assert.match(alerts[0]!, /given up/);
  assert.equal((await outboxCounts(pool)).dead, 1);
});

test("a job run is recorded as ok or error, and a failing job never throws", async () => {
  await pool.query("delete from job_runs");
  assert.equal(await runJob(pool, { name: "good", everyMs: 1000, run: async () => {} }, log), "ok");
  assert.equal(await runJob(pool, { name: "bad", everyMs: 1000, run: async () => { throw new Error("boom"); } }, log), "error");
  const status = await jobStatuses(pool, [{ name: "good", everyMs: 1000, run: async () => {} }, { name: "bad", everyMs: 1000, run: async () => {} }], 60_000);
  const good = status.find((s) => s.job === "good")!;
  const bad = status.find((s) => s.job === "bad")!;
  assert.ok(good.lastOkAt);
  assert.equal(good.overdue, false);
  assert.equal(bad.lastOkAt, null);
  assert.equal(bad.overdue, true);
  assert.equal(bad.lastError?.message, "boom");
});
