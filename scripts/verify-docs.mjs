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
  "ADR-010-quick-view-editing-and-financial-controls.md",
  "ADR-011-ai-data-relationships-and-ingestion.md",
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
  "BR-AI-005",
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

const relationshipManifestPath = new URL(
  "../docs/api/data-relationship-manifest-v1.json",
  import.meta.url,
);
const relationshipGuidePath = new URL(
  "../docs/api/data-relationships-and-ingestion.md",
  import.meta.url,
);
const relationshipManifest = JSON.parse(await readFile(relationshipManifestPath, "utf8"));
const relationshipGuide = await readFile(relationshipGuidePath, "utf8");
const cashHeavyGuide = await readFile(
  new URL("../docs/api/cash-heavy-business-ingestion.md", import.meta.url),
  "utf8",
);

if (relationshipManifest.schemaVersion !== 1 || relationshipManifest.apiVersion !== "v1") {
  throw new Error("Relationship manifest must declare schemaVersion 1 and API v1");
}
if (
  relationshipManifest.universalMutationPolicy?.directDatabaseAccess !== false ||
  relationshipManifest.universalMutationPolicy?.onMissingReference !==
    "reject_or_review_never_guess"
) {
  throw new Error("Relationship manifest must prohibit direct DB access and guessed references");
}

const stages = new Map(relationshipManifest.stages.map((stage) => [stage.id, stage.rank]));
const resources = new Map();
for (const resource of relationshipManifest.resources) {
  if (resources.has(resource.id))
    throw new Error(`Duplicate relationship resource: ${resource.id}`);
  if (!stages.has(resource.stage)) {
    throw new Error(`Unknown creation stage for ${resource.id}: ${resource.stage}`);
  }
  if (!resource.correction) throw new Error(`Missing correction policy for ${resource.id}`);
  resources.set(resource.id, resource);
}

for (const resource of resources.values()) {
  const resourceRank = stages.get(resource.stage);
  for (const dependency of resource.dependsOn ?? []) {
    const target = resources.get(dependency);
    if (!target) throw new Error(`Unknown dependency ${dependency} from ${resource.id}`);
    if (stages.get(target.stage) > resourceRank) {
      throw new Error(`Dependency order is reversed: ${resource.id} -> ${dependency}`);
    }
  }
  for (const reference of resource.references ?? []) {
    if (!reference.field || !reference.targetKey || !reference.onMissing) {
      throw new Error(`Incomplete reference on ${resource.id}`);
    }
    for (const targetId of reference.target.split("|")) {
      if (targetId !== "journal" && !resources.has(targetId)) {
        throw new Error(`Unknown reference target ${targetId} from ${resource.id}`);
      }
    }
  }
}

const requiredGuideSections = [
  "## 1. Non-negotiable rules",
  "## 3. Identity types",
  "## 5. Required creation order",
  "## 6. Relationship lookup algorithm",
  "## 7. Core field-to-resource map",
  "## 8. Canonical recipes",
  "### 8.2 Customer – project – invoice relationship",
  "## 10. Error and retry behavior",
  "## 11. Final AI checklist",
];
for (const heading of requiredGuideSections) {
  if (!relationshipGuide.includes(heading)) {
    throw new Error(`AI data relationship guide is missing: ${heading}`);
  }
}
if (!relationshipManifest.recipes?.length) throw new Error("Relationship manifest needs recipes");
const commercialDocumentRelationship = resources.get("commercial_document");
if (
  !commercialDocumentRelationship?.relationshipRules?.some((rule) =>
    rule.includes("sales_invoice"),
  ) ||
  !commercialDocumentRelationship.references?.some((reference) =>
    reference.field.includes("dimensions.projectId"),
  )
) {
  throw new Error("Commercial document must define customer-project-invoice relationship rules");
}
if (!resources.has("internal_transfer")) {
  throw new Error("Relationship manifest must include internal transfers");
}
const requiredCashActivities = [
  "sales_invoice_and_receipt",
  "purchase_invoice_and_payment",
  "non_invoice_cash_expense",
  "owner_or_employee_paid_company_expense",
  "owner_direct_business_payment",
  "owner_funding_company_account",
  "company_large_invoice_payment_after_owner_funding",
  "customer_receipt_into_owner_personal_account",
  "owner_reimbursement",
  "owner_capital_withdrawal_or_loan",
  "owner_withdrawal_from_company",
];
const activityIds = new Set(
  relationshipManifest.businessActivityCoverage?.map((entry) => entry.activity) ?? [],
);
for (const activity of requiredCashActivities) {
  if (!activityIds.has(activity)) throw new Error(`Missing cash activity coverage: ${activity}`);
}
for (const heading of [
  "## Default model",
  "## Decision table",
  "## Owner current-account operating cycle",
  "## Output invoice",
  "## Input invoice paid by owner",
  "## Non-invoice expense paid by owner",
  "## Reimbursing the owner",
  "## Customer money received in the owner's account",
  "## Minimal AI workflow",
  "## Stop conditions",
]) {
  if (!cashHeavyGuide.includes(heading)) {
    throw new Error(`Cash-heavy business guide is missing: ${heading}`);
  }
}
if (!relationshipManifest.recipes?.some((recipe) => recipe.id === "owner_current_account_cycle")) {
  throw new Error("Relationship manifest is missing owner_current_account_cycle recipe");
}

process.stdout.write(
  `Verified ${requiredAdrs.length} accepted ADRs, ${requiredRuleReferences.length} rule references, and ${resources.size} AI relationship resources.\n`,
);
