import { execFileSync, spawn } from "node:child_process";

const writeEnabled = process.argv.includes("--write");
const checkOnly = process.argv.includes("--check");
const upstreamBaseUrl = process.env.NAAI_ERP_DEV_UPSTREAM_BASE_URL || "https://erp.naai.studio";

function keychainValue(service, account = "admin", required = true) {
  try {
    return execFileSync("security", ["find-generic-password", "-s", service, "-a", account, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    if (!required) return "";
    throw new Error(
      `Missing macOS Keychain credential ${service}/${account}. Add it before starting production-backed development.`,
    );
  }
}

const upstreamToken = keychainValue("naai-erp-api-token");
const organization = keychainValue("naai-erp-organization", "admin", false) || "naai";

if (!upstreamToken) throw new Error("The production API token in macOS Keychain is empty.");
if (!upstreamBaseUrl.startsWith("https://")) {
  throw new Error("NAAI_ERP_DEV_UPSTREAM_BASE_URL must use HTTPS.");
}

const environment = {
  ...process.env,
  NEXT_PUBLIC_API_URL: "http://localhost:3000/dev-api",
  NEXT_PUBLIC_ORGANIZATION_ID: organization,
  NEXT_PUBLIC_FORCE_DEFAULT_API_CONNECTION: "1",
  // Prevent a legacy .env.local value from exposing an API token to browser code.
  NEXT_PUBLIC_API_TOKEN: "",
  NAAI_ERP_DEV_UPSTREAM_BASE_URL: upstreamBaseUrl,
  NAAI_ERP_DEV_UPSTREAM_ORGANIZATION: organization,
  NAAI_ERP_DEV_UPSTREAM_TOKEN: upstreamToken,
  ...(writeEnabled
    ? {
        NAAI_ERP_DEV_ALLOW_PROJECT_UPDATES: "1",
        NAAI_ERP_DEV_ALLOW_EXPENSE_CREATES: "1",
        NAAI_ERP_DEV_ALLOW_DOCUMENT_CREATES: "1",
      }
    : {}),
};

if (checkOnly) {
  console.log(
    `Production-backed development configuration is ready (${organization}, ${writeEnabled ? "write-enabled" : "read-only"}).`,
  );
  process.exit(0);
}

console.log(
  `Starting http://localhost:3000 against ${upstreamBaseUrl} (${writeEnabled ? "explicit write routes enabled" : "read-only"}).`,
);

const child = spawn("pnpm", ["--filter", "@naai-erp/web", "dev"], {
  env: environment,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
