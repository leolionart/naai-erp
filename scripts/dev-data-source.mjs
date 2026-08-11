import { spawn, spawnSync } from "node:child_process";

const [mode, ...forwardedArgs] = process.argv.slice(2);
const checkOnly = forwardedArgs.includes("--check");

if (!mode || !["local", "production"].includes(mode)) {
  throw new Error("Usage: node scripts/dev-data-source.mjs <local|production> [--check|--write]");
}

function run(command, args, environment = process.env) {
  const child = spawn(command, args, { env: environment, stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

if (mode === "production") {
  console.log("Data source: production API through the server-only read proxy.");
  run("node", ["scripts/dev-web-production-data.mjs", ...forwardedArgs]);
} else {
  if (forwardedArgs.includes("--write")) {
    throw new Error("--write only applies to the production-backed profile");
  }
  const databaseUrl =
    process.env.DATABASE_URL ?? "postgresql://naai_erp:naai_erp@127.0.0.1:5432/naai_erp";
  const organizationId = process.env.NAAI_ERP_LOCAL_ORGANIZATION ?? "naai";
  const environment = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    NEXT_PUBLIC_API_URL: "http://localhost:3001",
    NEXT_PUBLIC_ORGANIZATION_ID: organizationId,
    NEXT_PUBLIC_FORCE_DEFAULT_API_CONNECTION: "1",
  };

  if (checkOnly) {
    const status = spawnSync("node", ["scripts/native-dev-db.mjs", "status"], {
      env: environment,
      encoding: "utf8",
    });
    if (status.status !== 0) {
      process.stderr.write(status.stdout ?? "");
      process.stderr.write(status.stderr ?? "");
      process.exit(status.status ?? 1);
    }
    console.log(`Local-data development configuration is ready (${organizationId}, API :3001).`);
    process.exit(0);
  }

  const setup = spawnSync("node", ["scripts/native-dev-db.mjs", "setup"], {
    env: environment,
    stdio: "inherit",
  });
  if (setup.status !== 0) process.exit(setup.status ?? 1);

  console.log("Data source: local PostgreSQL and local API at http://localhost:3001.");
  console.log("Starting the web and API development processes together.");
  run("pnpm", ["dev:preview"], environment);
}
