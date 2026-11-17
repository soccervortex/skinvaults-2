import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { loadConfig, ConfigError, type Config } from "./config.ts";
import { createLogger, errorMessage, type Logger } from "./platform/logger.ts";
import { createPool, migrate, type Pool } from "./platform/db.ts";
import { startJobs, jobStatuses, type Job } from "./platform/jobs.ts";
import { deliverDue, outboxCounts } from "./platform/outbox.ts";
import { createSenders } from "./platform/senders.ts";
import { createAlerter } from "./platform/alerts.ts";
import { createWeb, notFoundHtml } from "./web/router.ts";
import { deleteStalePending } from "./waitlist.ts";

const startedAt = Date.now();

// One error shape for every route: { error: { code, message } }.
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
const fail = (res: ServerResponse, status: number, code: string, message: string) => sendJson(res, status, { error: { code, message } });

function tokenOk(req: IncomingMessage, expected: string): boolean {
  const given = Buffer.from((req.headers.authorization ?? "").replace(/^Bearer /i, ""));
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

async function main(): Promise<void> {
  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(err.message + "\n");
      process.exit(1);
    }
    throw err;
  }
  const log: Logger = createLogger(config.logLevel);
  const pool: Pool = createPool(config.databaseUrl);
  await migrate(pool, log);

  const alert = createAlerter(config, log);
  const senders = createSenders(config);
  const jobs: Job[] = [
    { name: "outbox-delivery", everyMs: 15_000, run: async () => { await deliverDue(pool, senders, alert, log); } },
    { name: "waitlist-cleanup", everyMs: 6 * 60 * 60_000, run: async () => { await deleteStalePending(pool); } },
  ];
  const handle = await startJobs(pool, jobs, log);

  const site = { baseUrl: config.site.publicBaseUrl, discordInviteUrl: config.site.discordInviteUrl, contactEmail: config.site.contactEmail };
  const web = createWeb(pool, site, { owners: config.owners, notify: (text) => void alert(text).catch(() => undefined), log });

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    void (async () => {
      try {
        if (req.method === "GET" && url.pathname === "/healthz") {
          await pool.query("select 1");
          return sendJson(res, 200, { ok: true });
        }
        if (req.method === "GET" && url.pathname === "/status") {
          if (!tokenOk(req, config.statusToken)) return fail(res, 401, "unauthorized", "Missing or wrong token");
          return sendJson(res, 200, {
            uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
            jobs: await jobStatuses(pool, jobs, Date.now() - startedAt),
            outbox: await outboxCounts(pool),
          });
        }
        if (await web.handle(req, res, url)) return;
        if ((req.headers.accept ?? "").includes("text/html")) {
          res.writeHead(404, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, no-transform" });
          return void res.end(notFoundHtml(site));
        }
        return fail(res, 404, "not_found", "No such route");
      } catch (err) {
        log.error("request_failed", { path: url.pathname, error: errorMessage(err) });
        return fail(res, 500, "internal", "Something went wrong");
      }
    })();
  });
  server.listen(config.port, () => log.info("listening", { port: config.port }));

  const shutdown = async (signal: string) => {
    log.info("shutting_down", { signal });
    server.close();
    await handle.stop();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${errorMessage(err)}\n`);
  process.exit(1);
});
