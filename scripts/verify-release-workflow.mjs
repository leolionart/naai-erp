import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "scripts/release-images.json");
const workflowPath = resolve(root, ".github/workflows/release-main.yml");
const ciWorkflowPath = resolve(root, ".github/workflows/ci.yml");
const expectedImages = new Map([
  ["naai-erp-api", "docker/Dockerfile.api"],
  ["naai-erp-web", "docker/Dockerfile.web"],
  ["naai-erp-worker", "docker/Dockerfile.worker"],
  ["naai-erp-migrate", "docker/Dockerfile.migrate"],
]);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const workflow = await readFile(workflowPath, "utf8");
const ciWorkflow = await readFile(ciWorkflowPath, "utf8");

assert.equal(manifest.registry, "ghcr.io", "release registry must be GHCR");
assert.equal(
  manifest.namespace,
  "leolionart",
  "release namespace must match github.com/leolionart/naai-erp",
);
assert.ok(Array.isArray(manifest.images), "release manifest images must be an array");
assert.equal(
  manifest.images.length,
  expectedImages.size,
  "release manifest must define four images",
);

const actualNames = new Set();
for (const image of manifest.images) {
  assert.equal(typeof image.name, "string", "every release image needs a name");
  assert.equal(typeof image.dockerfile, "string", `${image.name} needs a Dockerfile`);
  assert.equal(image.context, ".", `${image.name} must build from the repository root`);
  assert.equal(
    image.dockerfile,
    expectedImages.get(image.name),
    `${image.name} has an unexpected Dockerfile`,
  );
  assert.ok(!actualNames.has(image.name), `duplicate release image: ${image.name}`);
  actualNames.add(image.name);
  await access(resolve(root, image.dockerfile));
}
assert.deepEqual(actualNames, new Set(expectedImages.keys()), "release image set is incomplete");

const requiredWorkflowPatterns = [
  [/push:\s*\n\s*branches:\s*\[main\]/, "workflow must run on main pushes"],
  [/packages:\s*write/, "workflow must be allowed to publish packages"],
  [/run:\s*pnpm check/, "release must run the repository quality gate"],
  [/run:\s*pnpm db:check/, "release must check database metadata"],
  [/run:\s*pnpm db:migrate/, "release must test migrations"],
  [/RUN_DB_INTEGRATION:\s*["']1["']/, "release must run database integration tests"],
  [/run:\s*pnpm test:e2e/, "release must run browser end-to-end tests"],
  [/needs:\s*checks/, "image publication must depend on checks"],
  [/uses:\s*docker\/login-action@v3/, "workflow must authenticate to GHCR"],
  [/uses:\s*docker\/build-push-action@v6/, "workflow must use Buildx image publication"],
  [/platforms:\s*linux\/amd64,linux\/arm64/, "release must publish amd64 and arm64 images"],
  [/push:\s*true/, "workflow must push built images"],
  [/sha-\$\{\{\s*needs\.checks\.outputs\.short_sha\s*\}\}/, "immutable tags must use sha-<12>"],
  [
    /org\.opencontainers\.image\.revision=\$\{\{\s*github\.sha\s*\}\}/,
    "images must carry the exact OCI revision",
  ],
  [
    /org\.opencontainers\.image\.source=https:\/\/github\.com\/leolionart\/naai-erp/,
    "images must identify the canonical repository",
  ],
  [/provenance:\s*mode=max/, "release images must publish provenance"],
  [/sbom:\s*true/, "release images must publish an SBOM"],
];

for (const [pattern, message] of requiredWorkflowPatterns) {
  assert.match(workflow, pattern, message);
}

assert.match(
  workflow,
  /short_sha=\$\{GITHUB_SHA::12\}/,
  "workflow must truncate the commit SHA to exactly 12 characters",
);
assert.match(
  workflow,
  /fromJSON\(needs\.checks\.outputs\.matrix\)/,
  "build matrix must come from the verified release manifest",
);
assert.doesNotMatch(workflow, /nclamvn/i, "workflow must not publish to the obsolete namespace");

for (const [name, dockerfile] of expectedImages) {
  assert.match(ciWorkflow, new RegExp(`name:\\s*${name}`), `CI must build ${name}`);
  assert.match(
    ciWorkflow,
    new RegExp(`dockerfile:\\s*${dockerfile.replaceAll("/", "\\/")}`),
    `CI must use ${dockerfile}`,
  );
}
assert.match(
  ciWorkflow,
  /uses:\s*docker\/build-push-action@v6/,
  "CI must build images with Buildx",
);

console.log(
  `Release workflow verified: ${manifest.images.length} images, main + sha-<12> tags, exact OCI revision.`,
);
