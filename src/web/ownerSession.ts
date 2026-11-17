import { createHmac, timingSafeEqual } from "node:crypto";

// The owner sign-in cookie: a signed, expiring token. The server stores nothing; changing OWNER_SESSION_VERSION
// or SESSION_SECRET signs everyone out at once. HttpOnly, SameSite=Lax and (on https) Secure with the __Host- prefix.

export type OwnerName = "owner" | "co-owner";
export type OwnerAuth = { sessionSecret: string; version: string; accounts: { name: OwnerName; hash: string }[] };

export const SESSION_TTL_MS = 12 * 60 * 60_000;

const sign = (secret: string, payload: string): string => createHmac("sha256", secret).update(`sv-owner-v1.${payload}`).digest("base64url");

export function createSessionToken(auth: OwnerAuth, name: OwnerName, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ n: name, v: auth.version, e: now + SESSION_TTL_MS })).toString("base64url");
  return `${payload}.${sign(auth.sessionSecret, payload)}`;
}

export function readSessionToken(auth: OwnerAuth, token: string | undefined, now = Date.now()): OwnerName | null {
  if (!token || token.length > 400) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(auth.sessionSecret, payload));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { n?: unknown; v?: unknown; e?: unknown };
    if (typeof data.e !== "number" || data.e <= now || data.v !== auth.version) return null;
    return auth.accounts.find((a) => a.name === data.n)?.name ?? null;
  } catch {
    return null;
  }
}

export const cookieName = (secure: boolean): string => (secure ? "__Host-sv_owner" : "sv_owner");

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

export function setCookie(name: string, value: string, secure: boolean, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
export function sessionCookie(value: string, secure: boolean, maxAgeSeconds: number): string {
  return setCookie(cookieName(secure), value, secure, maxAgeSeconds);
}
