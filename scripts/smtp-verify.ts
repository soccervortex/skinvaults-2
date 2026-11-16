// Checks that the SMTP settings in the environment can connect, upgrade to TLS and log in. Sends nothing.
import { loadConfig } from "../src/config.ts";
import { createMailer } from "../src/platform/senders.ts";
import { errorMessage } from "../src/platform/logger.ts";

try {
  const config = loadConfig();
  await createMailer(config.smtp).verify();
  console.log(`SMTP ok: ${config.smtp.host}:${config.smtp.port} accepted the login`);
} catch (err) {
  console.error(`SMTP check failed: ${errorMessage(err)}`);
  process.exit(1);
}
