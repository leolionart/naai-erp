# Risks and follow-ups

- Full PostgreSQL integration evidence remains environment-dependent because the repository's integration fixtures use fixed organization IDs and the shared native database already contains those IDs. Run the integration catalog against a clean disposable database before marking the database gate complete.
- Node 26 emitted the repository's existing engine warning (`>=22 <25`); no behavior failure was observed.
