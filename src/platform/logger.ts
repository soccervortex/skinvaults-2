// One JSON object per line on stdout, so Nebula's live log view and any later tooling can read it.
// Callers pass plain fields; errors are reduced to their message so stacks with secrets never leak by accident.

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type Logger = {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
};

export function createLogger(minLevel: Level, write: (line: string) => void = (l) => process.stdout.write(l + "\n")): Logger {
  const emit = (level: Level, event: string, fields: Record<string, unknown> = {}) => {
    if (ORDER[level] < ORDER[minLevel]) return;
    write(JSON.stringify({ t: new Date().toISOString(), level, event, ...fields }));
  };
  return {
    debug: (e, f) => emit("debug", e, f),
    info: (e, f) => emit("info", e, f),
    warn: (e, f) => emit("warn", e, f),
    error: (e, f) => emit("error", e, f),
  };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
