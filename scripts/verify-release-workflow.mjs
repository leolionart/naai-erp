import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { selectReleaseImages } from "./select-release-images.mjs";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "scripts/release-images.json");
const workflowPath = resolve(root, ".github/workflows/release-main.yml");
const apiDockerfilePath = resolve(root, "docker/Dockerfile.api");
const expectedImages = new Map([
  ["naai-erp-api", "docker/Dockerfile.api"],
  ["naai-erp-web", "docker/Dockerfile.web"],
  ["naai-erp-worker", "docker/Dockerfile.worker"],
  ["naai-erp-migrate", "docker/Dockerfile.migrate"],
]);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const workflow = await readFile(workflowPath, "utf8");
const apiDockerfile = await readFile(apiDockerfilePath, "utf8");

assert.equal(manifest.registry, "ghcr.io", "release registry must be GHCR");
assert.ok(
  manifest.releaseSetVersion >= 2,
  "release set must include bounded GHCR publication concurrency",
);
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

assert.deepEqual(
  selectReleaseImages(manifest, { web: true }).include.map((image) => image.name),
  ["naai-erp-web"],
  "web-only changes must publish only the web image",
);
assert.deepEqual(
  selectReleaseImages(manifest, { migrate: true }).include.map((image) => image.name),
  ["naai-erp-migrate"],
  "database-only changes must publish only the migrate image",
);
assert.equal(
  selectReleaseImages(manifest, {}).include.length,
  0,
  "non-runtime changes must produce an empty image matrix",
);
assert.equal(
  selectReleaseImages(manifest, { manifest: true }).include.length,
  4,
  "release manifest or Docker topology changes must publish every image",
);

const requiredWorkflowPatterns = [
  [/push:\s*\n\s*branches:\s*\[main\]/, "workflow must run on main pushes"],
  [/paths:\s*\n(?:\s*-\s*"[^"]+"\s*\n)+/, "workflow must filter release-relevant paths"],
  [/"apps\/\*\*"/, "application code changes must trigger image publication"],
  [/"packages\/\*\*"/, "shared package changes must trigger image publication"],
  [/"db\/migrations\/\*\*"/, "database migrations must trigger image publication"],
  [/"docker\/\*\*"/, "Docker packaging changes must trigger image publication"],
  [/"pnpm-lock\.yaml"/, "dependency lock changes must trigger image publication"],
  [
    /"docs\/api\/openapi-v1\.json"/,
    "the OpenAPI artifact copied into the API image must trigger publication",
  ],
  [/uses:\s*dorny\/paths-filter@v3/, "release must detect affected images before publishing"],
  [/node scripts\/select-release-images\.mjs/, "dynamic matrix must use the tested selector"],
  [/id:\s*changes/, "affected-image detection must expose stable outputs"],
  [
    /API_CHANGED:\s*\$\{\{\s*steps\.changes\.outputs\.api\s*\}\}/,
    "API changes must feed the dynamic matrix",
  ],
  [
    /WEB_CHANGED:\s*\$\{\{\s*steps\.changes\.outputs\.web\s*\}\}/,
    "web changes must feed the dynamic matrix",
  ],
  [
    /WORKER_CHANGED:\s*\$\{\{\s*steps\.changes\.outputs\.worker\s*\}\}/,
    "worker changes must feed the dynamic matrix",
  ],
  [
    /MIGRATE_CHANGED:\s*\$\{\{\s*steps\.changes\.outputs\.migrate\s*\}\}/,
    "migration changes must feed the dynamic matrix",
  ],
  [/if:\s*needs\.checks\.outputs\.has_images == 'true'/, "publish must skip an empty image matrix"],
  [/packages:\s*write/, "workflow must be allowed to publish packages"],
  [/node scripts\/verify-release-workflow\.mjs/, "release must verify its image contract"],
  [/node scripts\/verify-compose\.mjs/, "release must validate the Compose packaging contract"],
  [/needs:\s*checks/, "image publication must depend on checks"],
  [/uses:\s*docker\/login-action@v3/, "workflow must authenticate to GHCR"],
  [/uses:\s*docker\/build-push-action@v6/, "workflow must use Buildx image publication"],
  [/max-parallel:\s*2/, "GHCR publication concurrency must remain bounded"],
  [/platforms:\s*linux\/amd64,linux\/arm64/, "release must publish amd64 and arm64 images"],
  [/push:\s*true/, "workflow must push built images"],
  [/\$\{\{\s*matrix\.name\s*\}\}:latest/, "release must publish the Watchtower latest tag"],
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
assert.doesNotMatch(workflow, /pnpm check/, "release must not duplicate the full CI quality gate");
assert.doesNotMatch(workflow, /test:e2e/, "release must not duplicate browser E2E tests");
assert.doesNotMatch(
  workflow,
  /RUN_DB_INTEGRATION/,
  "release must not duplicate DB integration tests",
);
assert.match(
  apiDockerfile,
  /COPY --chown=node:node docs\/api\/openapi-v1\.json \/docs\/api\/openapi-v1\.json/,
  "API image must include the versioned OpenAPI document used by discovery",
);

console.log(
  `Release workflow verified: ${manifest.images.length} images, main + sha-<12> tags, exact OCI revision.`,
);
