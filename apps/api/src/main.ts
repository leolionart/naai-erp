import "reflect-metadata";
import { createApp } from "./bootstrap.js";
import { runPendingMigrations, shouldMigrateOnStart } from "./migrate-on-start.js";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);
const host = process.env.HOST ?? "0.0.0.0";

if (shouldMigrateOnStart()) {
  try {
    await runPendingMigrations();
  } catch (error) {
    // Never serve traffic against a schema that is behind the code; let the orchestrator retry.
    console.error(
      "Database migration failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    process.exit(1);
  }
}

const app = await createApp();

await app.listen({ port, host });
