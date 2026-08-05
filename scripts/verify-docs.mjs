import { readFile, stat } from "node:fs/promises";

const requiredAdrs = [
  "ADR-001-stack-and-modular-monolith.md",
  "ADR-002-organization-isolation-and-auth.md",
  "ADR-003-accounting-invariants.md",
  "ADR-004-transactions-outbox-and-idempotency.md",
  "ADR-005-evidence-storage.md",
  "ADR-006-reporting-and-read-models.md",
  "ADR-007-license-policy.md",
  "ADR-009-ai-native-interfaces.md",
];

const requiredRuleReferences = [
  "BR-ORG-001",
  "BR-AUD-001",
  "BR-LED-001",
  "BR-LED-002",
  "BR-REV-001",
  "BR-TAX-001",
  "BR-AI-001",
  "BR-AI-002",
  "BR-AI-003",
  "BR-AI-004",
];

const contents = [];

for (const filename of requiredAdrs) {
  const path = new URL(`../docs/architecture/${filename}`, import.meta.url);
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size < 200) {
    throw new Error(`ADR is missing or incomplete: ${filename}`);
  }
  const content = await readFile(path, "utf8");
  if (!content.includes("Status: Accepted")) {
    throw new Error(`ADR is not accepted: ${filename}`);
  }
  contents.push(content);
}

const combined = contents.join("\n");
for (const ruleId of requiredRuleReferences) {
  if (!combined.includes(ruleId)) {
    throw new Error(`Required business rule is not referenced by ADRs: ${ruleId}`);
  }
}

process.stdout.write(
  `Verified ${requiredAdrs.length} accepted ADRs and ${requiredRuleReferences.length} rule references.\n`,
);
