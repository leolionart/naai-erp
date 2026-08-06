import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const env = {
  ...process.env,
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || "compose-contract-test",
};

function fail(message) {
  throw new Error(`Compose packaging contract failed: ${message}`);
}

function runDockerCompose(args) {
  return execFileSync("docker", ["compose", ...args], {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const rendered = JSON.parse(
  runDockerCompose([
    "-f",
    "compose.yaml",
    "-f",
    "compose.build.yaml",
    "config",
    "--format",
    "json",
  ]),
);
const services = rendered.services ?? {};

for (const name of ["postgres", "migrate", "api", "worker", "web"]) {
  if (!services[name]) fail(`missing ${name} service`);
}

if (!rendered.volumes?.["postgres-data"]) fail("missing postgres-data named volume");
const postgresMounts = services.postgres.volumes ?? [];
if (
  !postgresMounts.some(
    (mount) => mount.type === "volume" && mount.target === "/var/lib/postgresql/data",
  )
) {
  fail("postgres does not mount its named volume at /var/lib/postgresql/data");
}
if (services.migrate.restart && services.migrate.restart !== "no")
  fail("migrate must be one-shot with restart: no");
if (services.migrate.depends_on?.postgres?.condition !== "service_healthy")
  fail("migrate must wait for healthy postgres");
for (const name of ["api", "worker"]) {
  if (services[name].depends_on?.migrate?.condition !== "service_completed_successfully") {
    fail(`${name} must wait for successful migration`);
  }
}
if (services.web.depends_on?.api?.condition !== "service_healthy")
  fail("web must wait for healthy api");
for (const name of ["postgres", "api", "worker", "web"]) {
  if (!services[name].healthcheck?.test) fail(`${name} is missing a healthcheck`);
}

for (const file of [
  "Dockerfile.api",
  "Dockerfile.worker",
  "Dockerfile.web",
  "Dockerfile.migrate",
]) {
  const source = readFileSync(resolve(root, "docker", file), "utf8");
  if (!/^USER node$/m.test(source)) fail(`${file} does not declare the non-root node user`);
}

console.log("Compose packaging contract passed.");
