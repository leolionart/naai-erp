# Risks

- If a partially-dropped table exists with an incompatible shape, this repair intentionally fails rather than silently changing financial schema.
- Production must run the migrate image built from the commit containing migration 0063 before restarting API/worker.
