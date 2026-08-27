import { rm } from "node:fs/promises";

const targets = [".turbo", "apps/web/.next", "apps/api/dist", "apps/cli/dist", "apps/worker/dist"];
for (const target of targets) {
  await rm(target, { recursive: true, force: true });
  console.log(`Removed ${target}`);
}
