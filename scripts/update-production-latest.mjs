import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envFile = resolve(root, process.argv[2] || ".env.production");

if (!existsSync(envFile)) {
  throw new Error(`Production environment file not found: ${envFile}`);
}

const env = { ...process.env, IMAGE_TAG: "latest" };
const composeArgs = ["compose", "--env-file", envFile, "-f", "compose.yaml"];

function compose(args, options = {}) {
  return execFileSync("docker", [...composeArgs, ...args], {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
}

function readComposeState() {
  const output = compose(["ps", "-a", "--format", "json"], { capture: true }).trim();
  if (!output) return [];

  try {
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

function assertDeploymentState(rows) {
  const byService = new Map(rows.map((row) => [row.Service, row]));
  const migrate = byService.get("migrate");
  if (!migrate || migrate.State !== "exited" || Number(migrate.ExitCode) !== 0) {
    throw new Error("Migration verification failed: migrate must be exited with code 0.");
  }

  for (const service of ["postgres", "api", "worker", "web"]) {
    const row = byService.get(service);
    if (!row || row.State !== "running" || row.Health !== "healthy") {
      throw new Error(
        `Health verification failed for ${service}: state=${row?.State ?? "missing"}, health=${row?.Health ?? "missing"}.`,
      );
    }
  }
}

console.log("Updating NAAI ERP production with IMAGE_TAG=latest.");
compose(["config", "--quiet"]);
compose(["pull"]);
compose(["up", "-d", "--wait", "postgres"]);

// Prevent the old application version from accessing a schema while it is being upgraded.
compose(["stop", "web", "worker", "api"]);
compose([
  "up",
  "--no-deps",
  "--force-recreate",
  "--abort-on-container-exit",
  "--exit-code-from",
  "migrate",
  "migrate",
]);

// Application services are recreated only after the migration command succeeds.
compose(["up", "-d", "--no-deps", "--force-recreate", "--wait", "api", "worker", "web"]);
const state = readComposeState();
assertDeploymentState(state);
compose([
  "exec",
  "-T",
  "api",
  "node",
  "-e",
  "fetch('http://127.0.0.1:3001/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))",
]);
compose([
  "exec",
  "-T",
  "web",
  "node",
  "-e",
  "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))",
]);

console.log(
  "NAAI ERP latest-image update completed: migration succeeded and all services are healthy.",
);
