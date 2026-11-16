import { errorMessage, type Logger } from "./logger.ts";
import type { Pool } from "./db.ts";

export type Message =
  | { channel: "email"; to: string; subject: string; text: string; html?: string }
  | { channel: "discord"; webhook: string; content: string };

export type Senders = { email(m: Extract<Message, { channel: "email" }>): Promise<void>; discord(m: Extract<Message, { channel: "discord" }>): Promise<void> };

export const MAX_ATTEMPTS = 6;

export async function enqueue(pool: Pool, message: Message): Promise<number> {
  const { channel, ...payload } = message;
  const { rows } = await pool.query<{ id: string }>("insert into outbox (channel, payload) values ($1, $2) returning id", [channel, payload]);
  return Number(rows[0]!.id);
}

// 30 s, 1 min, 2 min, 4 min ... capped at one hour.
export function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 3_600_000);
}

type Row = { id: string; channel: Message["channel"]; payload: Record<string, unknown>; attempts: number };

// Claims due rows with a short lease (so two workers never send the same row), sends them, and records
// the result. A row that keeps failing becomes "dead" and the owner is alerted through a different path.
export async function deliverDue(pool: Pool, senders: Senders, alert: (text: string) => Promise<void>, log: Logger, batch = 10): Promise<{ sent: number; retried: number; dead: number }> {
  const claimed = await pool.query<Row>(
    `update outbox set next_attempt_at = now() + interval '5 minutes'
       where id in (select id from outbox where status='pending' and next_attempt_at <= now()
                    order by next_attempt_at limit $1 for update skip locked)
     returning id, channel, payload, attempts`, [batch]);

  const result = { sent: 0, retried: 0, dead: 0 };
  for (const row of claimed.rows) {
    const message = { channel: row.channel, ...row.payload } as Message;
    try {
      if (message.channel === "email") await senders.email(message);
      else await senders.discord(message);
      await pool.query("update outbox set status='sent', sent_at=now(), attempts=attempts+1, last_error=null where id=$1", [row.id]);
      result.sent++;
    } catch (err) {
      const attempts = row.attempts + 1;
      const reason = errorMessage(err).slice(0, 300);
      if (attempts >= MAX_ATTEMPTS) {
        await pool.query("update outbox set status='dead', attempts=$2, last_error=$3 where id=$1", [row.id, attempts, reason]);
        result.dead++;
        log.error("outbox_dead", { id: row.id, channel: row.channel, attempts, error: reason });
        await alert(`Outbox message ${row.id} (${row.channel}) failed ${attempts} times and was given up: ${reason}`);
      } else {
        await pool.query("update outbox set attempts=$2, last_error=$3, next_attempt_at = now() + ($4 * interval '1 millisecond') where id=$1", [row.id, attempts, reason, backoffMs(attempts)]);
        result.retried++;
        log.warn("outbox_retry", { id: row.id, channel: row.channel, attempts, error: reason });
      }
    }
  }
  return result;
}

export async function outboxCounts(pool: Pool): Promise<{ pending: number; dead: number; oldestPendingAgeSeconds: number | null }> {
  const { rows } = await pool.query<{ pending: string; dead: string; age: string | null }>(
    `select count(*) filter (where status='pending') as pending, count(*) filter (where status='dead') as dead,
            extract(epoch from now() - min(created_at) filter (where status='pending')) as age from outbox`);
  const r = rows[0]!;
  return { pending: Number(r.pending), dead: Number(r.dead), oldestPendingAgeSeconds: r.age === null ? null : Math.round(Number(r.age)) };
}
