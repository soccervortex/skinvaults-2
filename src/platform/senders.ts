import nodemailer from "nodemailer";
import type { Config } from "../config.ts";
import type { Message, Senders } from "./outbox.ts";

// Errors thrown here end up in outbox.last_error and logs, so they must never contain a webhook URL or a password.

export function createMailer(smtp: Config["smtp"]) {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: !smtp.secure, // port 587 must upgrade with STARTTLS, never fall back to plain text
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return {
    // Checks connection, TLS and login without sending anything.
    verify: () => transport.verify(),
    async send(m: Extract<Message, { channel: "email" }>) {
      await transport.sendMail({ from: smtp.from, to: m.to, subject: m.subject, text: m.text, html: m.html });
    },
  };
}

export async function postDiscord(url: string, content: string): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: content.slice(0, 1900) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Discord webhook answered HTTP ${res.status}`);
}

export function createSenders(config: Config): Senders {
  const mailer = createMailer(config.smtp);
  return {
    email: (m) => mailer.send(m),
    discord: async (m) => {
      const url = config.discordWebhooks[m.webhook];
      if (!url) throw new Error(`No DISCORD_WEBHOOK_${m.webhook.toUpperCase()} configured`);
      await postDiscord(url, m.content);
    },
  };
}
