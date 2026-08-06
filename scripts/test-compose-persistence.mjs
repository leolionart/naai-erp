import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const project = `naai-erp-persistence-${Date.now()}`;
const password = randomUUID();
const env = {
  ...process.env,
  POSTGRES_PASSWORD: password,
  API_PORT: "0",
  WEB_PORT: "0",
};
const composeArgs = ["compose", "-p", project, "-f", "compose.yaml", "-f", "compose.build.yaml"];

function docker(args, options = {}) {
  return execFileSync("docker", args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

function compose(args, options) {
  return docker([...composeArgs, ...args], options);
}

function sql(statement) {
  return compose(
    [
      "exec",
      "-T",
      "postgres",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "naai_erp",
      "-d",
      "naai_erp",
      "-Atc",
      statement,
    ],
    { quiet: true },
  ).trim();
}

try {
  compose(["up", "-d", "--build", "--wait"]);
  sql(
    "create table if not exists compose_persistence_probe (id text primary key, created_at timestamptz not null default now())",
  );
  sql(
    "insert into compose_persistence_probe (id) values ('erp-740-sentinel') on conflict (id) do nothing",
  );

  compose(["down"]);
  compose(["up", "-d", "--wait"]);

  const count = sql("select count(*) from compose_persistence_probe where id='erp-740-sentinel'");
  if (count !== "1") throw new Error(`expected persisted sentinel, received count=${count}`);
  console.log("Compose PostgreSQL persistence test passed.");
} finally {
  try {
    compose(["down", "--volumes", "--remove-orphans"]);
  } catch {
    console.error(`Cleanup failed for isolated Compose project ${project}.`);
  }
}
