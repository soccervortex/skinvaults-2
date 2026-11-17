// The smallest slice of fetch we use, so tests can pass a fake instead of calling Steam.
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export const realFetch: FetchLike = (url, init) => fetch(url, init);

export const USER_AGENT = "SkinVaults/2.0 (+https://www.skinvaults.online)";
