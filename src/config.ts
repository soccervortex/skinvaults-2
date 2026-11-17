import { isValidHash } from "./platform/password.ts";
import type { OwnerAuth } from "./web/ownerSession.ts";

// All configuration comes from environment variables. Anything missing or malformed is reported
// by NAME in one error, so a bad deploy is fixed in one round. Values are never put in messages.

export type Config = {
  port: number;
  logLevel: "debug" | "info" | "warn" | "error";
  databaseUrl: string;
  statusToken: string;
  smtp: { host: string; port: number; secure: boolean; user: string; pass: string; from: string };
  alerts: { email: string | null; discordWebhook: string | null };
  discordWebhooks: Record<string, string>;
  // Public site settings. publicBaseUrl has no trailing slash and is used for canonical URLs and links in e-mails.
  site: { publicBaseUrl: string; discordInviteUrl: string | null; contactEmail: string | null };
  // Owner and co-owner sign-in. null (feature off) unless at least one password hash is set.
  owners: OwnerAuth | null;
  // Price service. null (no prices, inventory still works) unless SKINAPI_KEY is set.
  skinApi: { baseUrl: string; key: string } | null;
};

export class ConfigError extends Error {}

const REQUIRED = ["DATABASE_URL", "STATUS_TOKEN", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"] as const;

function blank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const problems: string[] = [];

  for (const name of REQUIRED) {
    if (blank(env[name])) problems.push(`${name} is missing`);
  }
  if (blank(env.OWNER_ALERT_EMAIL) && blank(env.DISCORD_WEBHOOK_ALERTS)) {
    problems.push("set at least one of OWNER_ALERT_EMAIL or DISCORD_WEBHOOK_ALERTS so a failure can reach a person");
  }

  const port = readInt(env.PORT, 3000, "PORT", problems);
  const smtpPort = readInt(env.SMTP_PORT, 587, "SMTP_PORT", problems);
  const level = (env.LOG_LEVEL ?? "info").trim();
  if (!["debug", "info", "warn", "error"].includes(level)) problems.push("LOG_LEVEL must be debug, info, warn or error");

  const token = (env.STATUS_TOKEN ?? "").trim();
  if (token !== "" && token.length < 24) problems.push("STATUS_TOKEN must be at least 24 characters");

  const publicBaseUrl = (blank(env.PUBLIC_BASE_URL) ? `http://localhost:${port}` : env.PUBLIC_BASE_URL!.trim()).replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s/]+$/.test(publicBaseUrl)) problems.push("PUBLIC_BASE_URL must look like https://example.com (no path)");
  const invite = blank(env.DISCORD_INVITE_URL) ? null : env.DISCORD_INVITE_URL!.trim();
  if (invite !== null && !/^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]+$/.test(invite)) {
    problems.push("DISCORD_INVITE_URL must look like https://discord.gg/abcdef");
  }
  const contact = blank(env.CONTACT_EMAIL) ? null : env.CONTACT_EMAIL!.trim();
  if (contact !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) problems.push("CONTACT_EMAIL is not a valid e-mail address");

  const owners = readOwners(env, problems);
  const skinApi = readSkinApi(env, problems);

  if (problems.length > 0) {
    throw new ConfigError(`Cannot start, fix the environment:\n- ${problems.join("\n- ")}`);
  }

  return {
    port,
    logLevel: level as Config["logLevel"],
    databaseUrl: env.DATABASE_URL!.trim(),
    statusToken: token,
    smtp: {
      host: env.SMTP_HOST!.trim(),
      port: smtpPort,
      secure: env.SMTP_SECURE === "true" || smtpPort === 465,
      user: env.SMTP_USER!.trim(),
      pass: env.SMTP_PASS!,
      from: env.SMTP_FROM!.trim(),
    },
    alerts: {
      email: blank(env.OWNER_ALERT_EMAIL) ? null : env.OWNER_ALERT_EMAIL!.trim(),
      discordWebhook: blank(env.DISCORD_WEBHOOK_ALERTS) ? null : env.DISCORD_WEBHOOK_ALERTS!.trim(),
    },
    discordWebhooks: collectWebhooks(env),
    site: { publicBaseUrl, discordInviteUrl: invite, contactEmail: contact },
    owners,
    skinApi,
  };
}

// Passwords are never stored, only scrypt hashes made with `npm run owner:hash`. Values are never put in messages.
function readOwners(env: NodeJS.ProcessEnv, problems: string[]): OwnerAuth | null {
  const accounts: OwnerAuth["accounts"] = [];
  for (const [name, variable] of [["owner", "OWNER_PASSWORD_HASH"], ["co-owner", "COOWNER_PASSWORD_HASH"]] as const) {
    const value = (env[variable] ?? "").trim();
    if (value === "") continue;
    if (!isValidHash(value)) problems.push(`${variable} is not a valid hash (create it with: npm run owner:hash)`);
    else accounts.push({ name, hash: value });
  }
  if (accounts.length === 2 && accounts[0]!.hash === accounts[1]!.hash) problems.push("OWNER_PASSWORD_HASH and COOWNER_PASSWORD_HASH must be different");
  if (accounts.length === 0) return null;
  const secret = (env.SESSION_SECRET ?? "").trim();
  if (secret.length < 32) problems.push("SESSION_SECRET must be at least 32 characters when an owner password hash is set");
  const version = (env.OWNER_SESSION_VERSION ?? "1").trim() || "1";
  return { sessionSecret: secret, version, accounts };
}

function readSkinApi(env: NodeJS.ProcessEnv, problems: string[]): Config["skinApi"] {
  const key = (env.SKINAPI_KEY ?? "").trim();
  if (key === "") return null;
  const baseUrl = ((env.SKINAPI_URL ?? "").trim() || "https://skinapi.skinvaults.online/api/v1").replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+(\/[^\s?#]*)?$/.test(baseUrl)) problems.push("SKINAPI_URL must be an https URL such as https://skinapi.skinvaults.online/api/v1");
  return { baseUrl, key };
}

function readInt(raw: string | undefined, fallback: number, name: string, problems: string[]): number {
  if (blank(raw)) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    problems.push(`${name} must be a whole number between 1 and 65535`);
    return fallback;
  }
  return n;
}

// Outbox rows name a webhook ("alerts", "events", ...); the URL itself lives only in the environment.
function collectWebhooks(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    const m = /^DISCORD_WEBHOOK_([A-Z0-9_]+)$/.exec(key);
    if (m && !blank(value)) out[m[1]!.toLowerCase()] = value!.trim();
  }
  return out;
}
