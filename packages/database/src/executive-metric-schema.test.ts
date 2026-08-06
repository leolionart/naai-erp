import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  executiveMetricSemanticKind,
  executiveMetricPolicyVersions,
  executiveMetricSemanticMappings,
  roiDefinitionVersions,
  roiInputFacts,
  roiPurpose,
} from "./schema.js";

describe("ERP-640 executive metric schema", () => {
  it("keeps equity disclosures and purpose-specific ROI semantics explicit", () => {
    expect(executiveMetricSemanticKind.enumValues).toEqual(
      expect.arrayContaining([
        "contributed_capital",
        "retained_earnings",
        "other_equity",
        "owner_withdrawal",
        "owner_loan",
        "unrestricted_cash",
        "restricted_cash",
      ]),
    );
    expect(roiPurpose.enumValues).toEqual(["project", "marketing", "custom"]);
  });

  it("versions and approves the organization-scoped executive metric policy", () => {
    const policy = getTableConfig(executiveMetricPolicyVersions);
    expect(policy.name).toBe("executive_metric_policy_versions");
    expect(policy.primaryKeys).toHaveLength(1);
    expect(policy.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "executive_metric_policy_effective_unique",
    );
    expect(policy.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "executive_metric_policy_version_positive",
        "executive_metric_policy_date_order",
        "executive_metric_policy_approval_metadata",
        "executive_metric_policy_average_burn_months_positive",
      ]),
    );
  });

  it("binds every semantic account to one immutable policy version and organization", () => {
    const mappings = getTableConfig(executiveMetricSemanticMappings);
    expect(mappings.name).toBe("executive_metric_semantic_mappings");
    expect(mappings.primaryKeys).toHaveLength(1);
    expect(mappings.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "executive_metric_semantic_mapping_account_unique",
    );
    expect(mappings.foreignKeys.map((key) => key.getName())).toEqual(
      expect.arrayContaining([
        "executive_metric_semantic_mappings_policy_fk",
        "executive_metric_semantic_mappings_account_fk",
      ]),
    );
    expect(mappings.checks.map((constraint) => constraint.name)).toContain(
      "executive_metric_semantic_mapping_sign",
    );
  });

  it("keeps project, marketing, and custom ROI definitions purpose-specific and versioned", () => {
    const definitions = getTableConfig(roiDefinitionVersions);
    expect(definitions.name).toBe("roi_definition_versions");
    expect(definitions.primaryKeys).toHaveLength(1);
    expect(definitions.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "roi_definition_effective_unique",
    );
    expect(definitions.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "roi_definition_version_positive",
        "roi_definition_date_order",
        "roi_definition_approval_metadata",
        "roi_definition_included_cost_policy_objects",
      ]),
    );
  });

  it("stores reviewed ROI return and investment facts with period and dimensions", () => {
    const facts = getTableConfig(roiInputFacts);
    expect(facts.name).toBe("roi_input_facts");
    expect(facts.primaryKeys).toHaveLength(1);
    expect(facts.foreignKeys.map((key) => key.getName())).toContain(
      "roi_input_facts_definition_fk",
    );
    expect(facts.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "roi_input_fact_source_unique",
    );
    expect(facts.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "roi_input_fact_period_order",
        "roi_input_fact_amount_nonnegative",
        "roi_input_fact_dimensions_object",
        "roi_input_fact_review_metadata",
      ]),
    );
  });
});
