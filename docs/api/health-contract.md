# Health and Readiness Contract

## API

- `GET /health/live`: process is alive; must not require optional dependencies.
- `GET /health/ready`: required dependencies are available and application may receive traffic.
- Response currently: `{ "service": "api", "status": "ok" }`.
- Future readiness adds database and required queue/storage checks without leaking connection details.

## Web

- `GET /health`: web runtime responds successfully.

## Worker

- Worker produces an observable heartbeat and handles SIGINT/SIGTERM gracefully.

## Rules

- Health endpoints never disclose secrets, stack traces or internal addresses.
- Liveness failure restarts a process; readiness failure removes it from traffic without restart loops where possible.
- Database migration is a one-shot service, not an API-replica startup race.
