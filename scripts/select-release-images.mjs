import { pathToFileURL } from "node:url";

export function selectReleaseImages(manifest, changes) {
  const all = changes.manifest === true;
  const selected = new Set(
    all
      ? manifest.images.map((image) => image.name)
      : [
          changes.api && "naai-erp-api",
          changes.web && "naai-erp-web",
          changes.worker && "naai-erp-worker",
          changes.migrate && "naai-erp-migrate",
        ].filter(Boolean),
  );
  return { include: manifest.images.filter((image) => selected.has(image.name)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = JSON.parse(process.env.RELEASE_MANIFEST ?? '{"images":[]}');
  const enabled = (name) => process.env[name] === "true";
  process.stdout.write(
    JSON.stringify(
      selectReleaseImages(manifest, {
        api: enabled("API_CHANGED"),
        web: enabled("WEB_CHANGED"),
        worker: enabled("WORKER_CHANGED"),
        migrate: enabled("MIGRATE_CHANGED"),
        manifest: enabled("MANIFEST_CHANGED"),
      }),
    ),
  );
}
