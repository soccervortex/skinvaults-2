# Runbook (foundation)

## Start-up refuses to run
The log lists missing variables by name. Set them in the Nebula app's environment and restart. Values are never printed.

## Is it healthy?
- `GET /healthz` returns `{"ok":true}` when the database answers.
- `GET /status` with `Authorization: Bearer <STATUS_TOKEN>` shows each job's last success and whether it is overdue, plus outbox counts
  (`pending`, `dead`, age of the oldest pending message). Overdue or `dead > 0` means look at the logs.

## A message is stuck or dead
`outbox` rows retry with backoff (30 s, 1 min, 2 min, ... max 1 h). After 6 failed attempts a row becomes `dead` and the owner is alerted by
every configured alert channel. `last_error` says why (never contains URLs or passwords). Fix the cause, then reset the row:
`update outbox set status='pending', attempts=0, next_attempt_at=now() where id=<id>;`

## A job failed
Each run is a row in `job_runs` (`status`, `error`, `duration_ms`). The scheduler never lets one job overlap itself.

## Deploy, rollback, backup, restore
TO DO in step 0 on Nebula: not yet written because not yet tested. Written only after a real restore has been done.
