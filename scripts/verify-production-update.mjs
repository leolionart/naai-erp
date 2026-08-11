import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "update-production-latest.mjs"), "utf8");

function requirePattern(pattern, message) {
  if (!pattern.test(source)) throw new Error(`Production update contract failed: ${message}`);
}

requirePattern(/IMAGE_TAG:\s*"latest"/, "the supported updater must pin the runtime to latest");
requirePattern(/compose\(\["pull"\]\)/, "images must be pulled before mutation");
requirePattern(
  /compose\(\["stop", "web", "worker", "api"\]\)/,
  "old application services must stop before migration",
);
requirePattern(
  /"--exit-code-from",\s*\n\s*"migrate"/,
  "migration failure must propagate as the command exit code",
);
requirePattern(
  /"--no-deps",\s*"--force-recreate",\s*"--wait",\s*"api",\s*"worker",\s*"web"/,
  "application services must be recreated and awaited after migration without rerunning dependencies",
);
requirePattern(/migrate\.State !== "exited"/, "the exited migration state must be verified");
requirePattern(/Number\(migrate\.ExitCode\) !== 0/, "the migration exit code must be verified");
requirePattern(/row\.Health !== "healthy"/, "runtime container health must be verified");
requirePattern(/health\/ready/, "API readiness must be checked from inside the container");
requirePattern(/127\.0\.0\.1:3000\/health/, "web health must be checked from inside the container");

const stopIndex = source.indexOf('compose(["stop", "web", "worker", "api"])');
const migrateIndex = source.indexOf('"--exit-code-from"');
const restartIndex = source.indexOf(
  'compose(["up", "-d", "--no-deps", "--force-recreate", "--wait"',
);
if (!(stopIndex < migrateIndex && migrateIndex < restartIndex)) {
  throw new Error(
    "Production update contract failed: stop, migrate and restart ordering is invalid",
  );
}

console.log("Production latest-image update contract passed.");
