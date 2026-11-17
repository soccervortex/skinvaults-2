import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "./platform/db.ts";

// Users are Steam accounts. A session is a random token in a cookie; only its hash is stored.

export const USER_SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

export type User = { steamId: string; personaName: string; avatarUrl: string };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const looksLikeSessionToken = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v);

export async function upsertUser(pool: Pool, user: User): Promise<void> {
  await pool.query(
    `insert into users (steam_id, persona_name, avatar_url) values ($1, $2, $3)
     on conflict (steam_id) do update set persona_name = excluded.persona_name, avatar_url = excluded.avatar_url, last_seen_at = now()`,
    [user.steamId, user.personaName.slice(0, 64), user.avatarUrl.slice(0, 300)],
  );
}

export async function createUserSession(pool: Pool, steamId: string, now = Date.now()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await pool.query("insert into sessions (token_hash, steam_id, expires_at) values ($1, $2, $3)", [hashToken(token), steamId, new Date(now + USER_SESSION_TTL_MS)]);
  return token;
}

export async function userForSession(pool: Pool, token: string | null, now = Date.now()): Promise<User | null> {
  if (!looksLikeSessionToken(token)) return null;
  const { rows } = await pool.query<{ steam_id: string; persona_name: string; avatar_url: string }>(
    `select u.steam_id, u.persona_name, u.avatar_url from sessions s join users u on u.steam_id = s.steam_id
     where s.token_hash = $1 and s.expires_at > $2`,
    [hashToken(token), new Date(now)],
  );
  const row = rows[0];
  return row ? { steamId: row.steam_id, personaName: row.persona_name, avatarUrl: row.avatar_url } : null;
}

export async function endUserSession(pool: Pool, token: string | null): Promise<void> {
  if (!looksLikeSessionToken(token)) return;
  await pool.query("delete from sessions where token_hash = $1", [hashToken(token)]);
}

export async function deleteExpiredSessions(pool: Pool): Promise<number> {
  return (await pool.query("delete from sessions where expires_at < now()")).rowCount ?? 0;
}

// "Delete my data": the user, their sessions (cascade) and their cached inventory.
export async function deleteUser(pool: Pool, steamId: string): Promise<void> {
  await pool.query("delete from inventory_cache where steam_id = $1", [steamId]);
  await pool.query("delete from users where steam_id = $1", [steamId]);
}
