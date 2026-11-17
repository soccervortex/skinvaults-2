// Steam sign-in through OpenID 2.0. Steam never gives us a password or an e-mail address, only a Steam ID.
// The only thing we trust is Steam's own answer to "is this assertion genuine" (check_authentication), and we also
// check that the assertion was meant for us (return_to) and covers the fields we rely on (the signed list).

import { realFetch, type FetchLike } from "./http.ts";

const ENDPOINT = "https://steamcommunity.com/openid/login";
const NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const CLAIMED_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const REQUIRED_SIGNED = ["claimed_id", "identity", "return_to", "response_nonce", "op_endpoint", "assoc_handle"];

export function loginUrl(callbackUrl: string, realm: string): string {
  const q = new URLSearchParams({
    "openid.ns": NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": callbackUrl,
    "openid.realm": realm,
    "openid.identity": IDENTIFIER_SELECT,
    "openid.claimed_id": IDENTIFIER_SELECT,
  });
  return `${ENDPOINT}?${q.toString()}`;
}

// Returns the 17-digit Steam ID when Steam confirms the assertion, otherwise null. Never throws.
export async function verifyAssertion(query: URLSearchParams, callbackUrl: string, fetchFn: FetchLike = realFetch): Promise<string | null> {
  try {
    if (query.get("openid.ns") !== NS || query.get("openid.mode") !== "id_res") return null;
    if (query.get("openid.op_endpoint") !== ENDPOINT) return null;
    if (query.get("openid.return_to") !== callbackUrl) return null;
    const match = CLAIMED_RE.exec(query.get("openid.claimed_id") ?? "");
    if (!match || query.get("openid.identity") !== query.get("openid.claimed_id")) return null;
    const signed = (query.get("openid.signed") ?? "").split(",");
    if (!REQUIRED_SIGNED.every((f) => signed.includes(f))) return null;

    // Echo back exactly what Steam sent, with the mode changed. A forged assertion cannot pass this call.
    const check = new URLSearchParams();
    for (const [key, value] of query) if (key.startsWith("openid.") && key !== "openid.mode") check.append(key, value);
    check.set("openid.mode", "check_authentication");
    const res = await fetchFn(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: check.toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const lines = (await res.text()).split("\n").map((l) => l.trim());
    return lines.includes("is_valid:true") ? match[1]! : null;
  } catch {
    return null;
  }
}
