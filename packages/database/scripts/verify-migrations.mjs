import { readdir } from "node:fs/promises";

const migrationsDirectory = new URL("../../../db/migrations/", import.meta.url);
const entries = await readdir(migrationsDirectory, { withFileTypes: true });
const invalidFiles = entries
  .filter((entry) => entry.isFile() && entry.name !== "README.md")
  .filter((entry) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(entry.name));

if (invalidFiles.length > 0) {
  throw new Error(
    `Invalid migration filenames: ${invalidFiles.map((entry) => entry.name).join(", ")}`,
  );
}

process.stdout.write(`Migration directory is valid (${entries.length} entries).\n`);
