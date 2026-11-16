import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, ConfigError } from "../src/config.ts";

const good = {
  DATABASE_URL: "postgresql://u:secretpw123@localhost:5432/db",
  STATUS_TOKEN: "x".repeat(32),
  SMTP_HOST: "smtp.example.com",
  SMTP_USER: "user@example.com",
  SMTP_PASS: "supersecretpassword",
  SMTP_FROM: "Skinvaults <no-reply@example.com>",
  OWNER_ALERT_EMAIL: "owner@example.com",
};

test("loads a complete environment with defaults", () => {
  const c = loadConfig(good);
  assert.equal(c.port, 3000);
  assert.equal(c.smtp.port, 587);
  assert.equal(c.smtp.secure, false);
});

test("lists every missing variable by name, in one error", () => {
  assert.throws(() => loadConfig({}), (err: unknown) => {
    assert.ok(err instanceof ConfigError);
    for (const name of ["DATABASE_URL", "STATUS_TOKEN", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "OWNER_ALERT_EMAIL"]) {
      assert.match(err.message, new RegExp(name));
    }
    return true;
  });
});

test("error messages never contain secret values", () => {
  assert.throws(() => loadConfig({ ...good, STATUS_TOKEN: "short", PORT: "abc" }), (err: unknown) => {
    const msg = (err as Error).message;
    assert.ok(!msg.includes("secretpw123"));
    assert.ok(!msg.includes("supersecretpassword"));
    assert.match(msg, /STATUS_TOKEN/);
    assert.match(msg, /PORT/);
    return true;
  });
});

test("needs at least one alert channel", () => {
  const { OWNER_ALERT_EMAIL: _omit, ...rest } = good;
  assert.throws(() => loadConfig(rest), /OWNER_ALERT_EMAIL or DISCORD_WEBHOOK_ALERTS/);
  assert.doesNotThrow(() => loadConfig({ ...rest, DISCORD_WEBHOOK_ALERTS: "https://example.invalid/hook" }));
});

test("port 465 turns on implicit TLS", () => {
  assert.equal(loadConfig({ ...good, SMTP_PORT: "465" }).smtp.secure, true);
});

test("named Discord webhooks are collected by lower-case name", () => {
  const c = loadConfig({ ...good, DISCORD_WEBHOOK_EVENTS: "https://example.invalid/e" });
  assert.equal(c.discordWebhooks["events"], "https://example.invalid/e");
});
