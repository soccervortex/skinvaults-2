import { errorMessage, type Logger } from "./logger.ts";
import type { Pool } from "./db.ts";

export type Job = { name: string; everyMs: number; run: () => Promise<void> };

// Runs one job and records start, result and duration in job_runs. Never throws: a failing job
// is an "error" row and a log line, which the status page and alerts read.
export async function runJob(pool: Pool, job: Job, log: Logger): Promise<"ok" | "error"> {
  const started = Date.now();
  const { rows } = await pool.query<{ id: string }>(
    "insert into job_runs (job, status) values ($1, 'running') returning id",
    [job.name],
  );
  const id = rows[0]!.id;
  try {
    await job.run();
    await pool.query("update job_runs set status='ok', finished_at=now(), duration_ms=$2 where id=$1", [id, Date.now() - started]);
    log.debug("job_ok", { job: job.name });
    return "ok";
  } catch (err) {
    const message = errorMessage(err).slice(0, 500);
    await pool.query("update job_runs set status='error', finished_at=now(), duration_ms=$2, error=$3 where id=$1", [id, Date.now() - started, message]);
    log.error("job_failed", { job: job.name, error: message });
    return "error";
  }
}

export type JobsHandle = { stop(): Promise<void> };

export async function startJobs(pool: Pool, jobs: Job[], log: Logger): Promise<JobsHandle> {
  // A run left "running" means the process died mid-job; say so instead of leaving it open forever.
  await pool.query("update job_runs set status='error', finished_at=now(), error='interrupted by restart' where status='running'");

  const running = new Set<string>();
  const inFlight = new Set<Promise<unknown>>();
  let stopped = false;

  const tick = (job: Job) => {
    if (stopped || running.has(job.name)) return; // never overlap a job with itself
    running.add(job.name);
    const p = runJob(pool, job, log).finally(() => {
      running.delete(job.name);
      inFlight.delete(p);
    });
    inFlight.add(p);
  };

  const timers = jobs.map((job) => {
    tick(job);
    return setInterval(() => tick(job), job.everyMs);
  });
  log.info("jobs_started", { jobs: jobs.map((j) => j.name) });

  return {
    async stop() {
      stopped = true;
      timers.forEach(clearInterval);
      await Promise.allSettled([...inFlight]);
    },
  };
}

export type JobStatus = {
  job: string;
  lastOkAt: string | null;
  lastError: { at: string; message: string } | null;
  overdue: boolean;
};

// "Overdue" = no success within three intervals. This is what the owner looks at to know a job silently stopped.
export async function jobStatuses(pool: Pool, jobs: Job[], processUptimeMs: number): Promise<JobStatus[]> {
  const out: JobStatus[] = [];
  for (const job of jobs) {
    const ok = await pool.query<{ t: Date }>("select max(finished_at) as t from job_runs where job=$1 and status='ok'", [job.name]);
    const err = await pool.query<{ t: Date; error: string }>(
      "select finished_at as t, error from job_runs where job=$1 and status='error' order by finished_at desc limit 1", [job.name]);
    const lastOk = ok.rows[0]?.t ?? null;
    const sinceOk = lastOk ? Date.now() - lastOk.getTime() : Infinity;
    const grace = job.everyMs * 3;
    out.push({
      job: job.name,
      lastOkAt: lastOk ? lastOk.toISOString() : null,
      lastError: err.rows[0] ? { at: err.rows[0].t.toISOString(), message: err.rows[0].error } : null,
      overdue: sinceOk > grace && processUptimeMs > grace,
    });
  }
  return out;
}
