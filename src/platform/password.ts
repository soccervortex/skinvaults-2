import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

// Password hashes for the owner login. scrypt from node:crypto, no extra dependency.
// Stored as  scrypt:N:r:p:salt:hash  (salt and hash are base64url, so the value has no characters that shells or env files treat specially).

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256; // longer input is refused before any hashing, so a huge body cannot cost CPU

const KEY_LENGTH = 32;
const DEFAULTS = { N: 32768, r: 8, p: 1 };

type Params = { N: number; r: number; p: number };
type Parsed = Params & { salt: Buffer; hash: Buffer };

function derive(password: string, salt: Buffer, { N, r, p }: Params): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, KEY_LENGTH, { N, r, p, maxmem: 256 * N * r + 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export function parseHash(stored: string): Parsed | null {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (!Number.isInteger(N) || N < 1024 || N > 131072 || (N & (N - 1)) !== 0) return null;
  if (!Number.isInteger(r) || r < 1 || r > 16 || !Number.isInteger(p) || p < 1 || p > 4) return null;
  const salt = Buffer.from(parts[4]!, "base64url");
  const hash = Buffer.from(parts[5]!, "base64url");
  if (salt.length < 16 || hash.length !== KEY_LENGTH) return null;
  return { N, r, p, salt, hash };
}

export const isValidHash = (stored: string): boolean => parseHash(stored) !== null;

export async function hashPassword(password: string, params: Params = DEFAULTS): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  if (password.length > MAX_PASSWORD_LENGTH) throw new Error(`password must be at most ${MAX_PASSWORD_LENGTH} characters`);
  const salt = randomBytes(16);
  const hash = await derive(password, salt, params);
  return `scrypt:${params.N}:${params.r}:${params.p}:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

// Never throws: a malformed stored value or an oversized password is simply "no match".
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (password.length > MAX_PASSWORD_LENGTH) return false;
  const parsed = parseHash(stored);
  if (!parsed) return false;
  try {
    const candidate = await derive(password, parsed.salt, parsed);
    return timingSafeEqual(candidate, parsed.hash);
  } catch {
    return false;
  }
}
