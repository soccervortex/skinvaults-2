import type { Config } from "../config.ts";
import { errorMessage, type Logger } from "./logger.ts";
import { createMailer, postDiscord } from "./senders.ts";

// Tells the owner something is wrong. Deliberately does NOT use the outbox (a broken outbox must still be able to alert)
// and tries every configured path, so one dead channel does not hide the problem.
export function createAlerter(config: Config, log: Logger): (text: string) => Promise<void> {
  const mailer = createMailer(config.smtp);
  return async (text) => {
    const attempts: Promise<string | null>[] = [];
    if (config.alerts.discordWebhook) {
      const url = config.alerts.discordWebhook;
      attempts.push(postDiscord(url, `Skinvaults 2.0 alert: ${text}`).then(() => null, (e) => `discord: ${errorMessage(e)}`));
    }
    if (config.alerts.email) {
      const to = config.alerts.email;
      attempts.push(mailer.send({ channel: "email", to, subject: "Skinvaults 2.0 alert", text }).then(() => null, (e) => `email: ${errorMessage(e)}`));
    }
    const failures = (await Promise.all(attempts)).filter((r): r is string => r !== null);
    if (failures.length === attempts.length) log.error("alert_not_delivered", { text, failures });
    else if (failures.length > 0) log.warn("alert_partly_delivered", { failures });
  };
}
