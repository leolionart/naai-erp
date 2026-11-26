# ERP-967

The API applies pending drizzle migrations on startup under an advisory lock (`MIGRATE_ON_START=0` opts out), the API image now carries `/db/migrations` and is rebuilt on migration changes. Also pinned time-dependent integration fixtures (financial statements) and made executive policy selection deterministic on equal effective dates.
