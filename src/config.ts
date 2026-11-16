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
  };
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
