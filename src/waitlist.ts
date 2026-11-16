import { randomBytes } from "node:crypto";
import type { Pool } from "./platform/db.ts";
import { enqueue } from "./platform/outbox.ts";

// Double opt-in waiting list. Nothing is sent to an address until its owner clicked the link in the confirmation mail.
// Unsubscribing deletes the row. Outcomes never reveal whether an address was already known.

export const RESEND_COOLDOWN_MS = 10 * 60_000;
export const PENDING_MAX_AGE_DAYS = 7;

const EMAIL_RE = /^[^\s@<>"',;:()\[\]\\]+@[^\s@<>"',;:()\[\]\\]+\.[^\s@<>"',;:()\[\]\\]{2,}$/;

export function normaliseEmail(raw: string): string | null {
  const email = raw.trim();
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;
  const [local, domain] = email.split("@") as [string, string];
  if (local.length > 64 || domain.includes("..")) return null;
  return `${local}@${domain.toLowerCase()}`;
}

const token = (): string => randomBytes(24).toString("base64url");

export function confirmationMail(baseUrl: string, confirmToken: string, unsubscribeToken: string) {
  const confirmUrl = `${baseUrl}/waitlist/confirm?token=${confirmToken}`;
  const unsubUrl = `${baseUrl}/waitlist/unsubscribe?token=${unsubscribeToken}`;
  return {
    subject: "Confirm your place on the SkinVaults waiting list",
    text: [
      "Hi,",
      "",
      "Someone (hopefully you) asked to be told when the new SkinVaults opens.",
      "Confirm that this is your address by opening this link:",
      confirmUrl,
      "",
      "If this was not you, ignore this mail. Without confirmation we keep nothing, and the request is deleted after a week.",
      `To remove your address at any time: ${unsubUrl}`,
      "",
      "SkinVaults",
    ].join("\n"),
    html: `<p>Hi,</p><p>Someone (hopefully you) asked to be told when the new SkinVaults opens. Confirm that this is your address:</p>
<p><a href="${confirmUrl}">Confirm my place on the waiting list</a></p>
<p>If this was not you, ignore this mail. Without confirmation we keep nothing, and the request is deleted after a week.</p>
<p><a href="${unsubUrl}">Remove my address</a></p><p>SkinVaults</p>`,
  };
}

export type SignupResult = "invalid" | "ok";

// "ok" is returned for new, pending and already confirmed addresses alike.
export async function signup(pool: Pool, baseUrl: string, rawEmail: string, now = Date.now()): Promise<SignupResult> {
  const email = normaliseEmail(rawEmail);
  if (email === null) return "invalid";

  const existing = await pool.query<{ id: string; status: string; confirm_token: string; unsubscribe_token: string; last_confirmation_sent_at: Date }>(
    "select id, status, confirm_token, unsubscribe_token, last_confirmation_sent_at from waitlist where lower(email) = lower($1)",
    [email],
  );
  const row = existing.rows[0];
  if (row) {
    if (row.status === "confirmed") return "ok";
    if (now - row.last_confirmation_sent_at.getTime() < RESEND_COOLDOWN_MS) return "ok";
    await pool.query("update waitlist set last_confirmation_sent_at = to_timestamp($2 / 1000.0) where id = $1", [row.id, now]);
    await enqueue(pool, { channel: "email", to: email, ...confirmationMail(baseUrl, row.confirm_token, row.unsubscribe_token) });
    return "ok";
  }

  const confirmToken = token();
  const unsubscribeToken = token();
  // A concurrent double submit hits the unique index; the loser simply does nothing, the winner already sent the mail.
  const inserted = await pool.query(
    "insert into waitlist (email, confirm_token, unsubscribe_token) values ($1, $2, $3) on conflict do nothing returning id",
    [email, confirmToken, unsubscribeToken],
  );
  if (inserted.rowCount === 1) {
    await enqueue(pool, { channel: "email", to: email, ...confirmationMail(baseUrl, confirmToken, unsubscribeToken) });
  }
  return "ok";
}

// Tokens are 32 URL-safe characters; anything else cannot match and is rejected before touching the database.
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
export const looksLikeToken = (t: string | null): t is string => t !== null && TOKEN_RE.test(t);

export async function confirm(pool: Pool, confirmToken: string): Promise<boolean> {
  const r = await pool.query(
    "update waitlist set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()) where confirm_token = $1 returning id",
    [confirmToken],
  );
  return r.rowCount === 1;
}

export async function unsubscribe(pool: Pool, unsubscribeToken: string): Promise<boolean> {
  const r = await pool.query("delete from waitlist where unsubscribe_token = $1 returning id", [unsubscribeToken]);
  return r.rowCount === 1;
}

export async function deleteStalePending(pool: Pool): Promise<number> {
  const r = await pool.query(
    "delete from waitlist where status = 'pending' and created_at < now() - ($1 || ' days')::interval",
    [String(PENDING_MAX_AGE_DAYS)],
  );
  return r.rowCount ?? 0;
}
