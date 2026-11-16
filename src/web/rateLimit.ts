// Small in-memory limiter: at most `max` hits per key within `windowMs`. Good enough for one instance;
// it resets on restart, which is acceptable because the database enforces the real rules (unique e-mail, resend cooldown).
export function createRateLimiter(max: number, windowMs: number, maxKeys = 10_000) {
  const hits = new Map<string, number[]>();
  return {
    allow(key: string, now = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > maxKeys) {
        for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
      }
      return true;
    },
  };
}
