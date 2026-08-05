import { readFile, stat } from "node:fs/promises";

const requiredFiles = [
  "docs/security/threat-model.md",
  "docs/security/secret-policy.md",
  "docs/runbooks/backup-restore-design.md",
  "docs/api/health-contract.md",
];

for (const filename of requiredFiles) {
  const metadata = await stat(filename);
  if (!metadata.isFile() || metadata.size < 200) {
    throw new Error(`Security baseline file is missing or incomplete: ${filename}`);
  }
}

const gitignore = await readFile(".gitignore", "utf8");
for (const ignoredSecret of [".env", "*.dump", "*.sql.gz"]) {
  if (!gitignore.includes(ignoredSecret)) {
    throw new Error(`Secret/data ignore rule is missing: ${ignoredSecret}`);
  }
}

process.stdout.write(`Verified ${requiredFiles.length} security/operations baseline documents.\n`);
