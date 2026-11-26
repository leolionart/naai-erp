import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION, type FundingInputContract } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  ALLOWED_FUNDING_TYPES,
  FUNDING_RULES_STORE,
  matchFundingRule,
  type CreateFundingRuleInput,
  type FundingRuleTestInput,
  type FundingRulesContext,
  type FundingRulesStore,
  type UpdateFundingRuleInput,
} from "./funding-rules.types.js";

const READ_ROLES = new Set([
  "owner",
  "finance_admin",
  "accountant",
  "approver",
  "viewer",
  "integration",
]);
const CONFIGURE_ROLES = new Set(["owner", "finance_admin"]);

@Injectable()
export class FundingRulesService {
  constructor(
    @Inject(FUNDING_RULES_STORE) private readonly store: FundingRulesStore,
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
  ) {}

  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }

  private envelope(context: FundingRulesContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }

  private assertFundingInput(funding: FundingInputContract | undefined) {
    if (!funding || !ALLOWED_FUNDING_TYPES.includes(funding.type)) {
      throw new Error("FUNDING_SOURCE_INVALID");
    }
    if (funding.type !== "owner_paid" && !funding.financialAccountId?.trim()) {
      throw new Error("FUNDING_FINANCIAL_ACCOUNT_REQUIRED");
    }
    if (funding.type === "owner_paid" && funding.financialAccountId) {
      throw new Error("FUNDING_FINANCIAL_ACCOUNT_NOT_ALLOWED");
    }
  }

  private assertRuleMatchers(input: { match?: CreateFundingRuleInput["match"] }) {
    const m = input.match;
    if (!m) return;
    if (
      m.minAmountMinor !== null &&
      m.minAmountMinor !== undefined &&
      !/^\d+$/.test(m.minAmountMinor)
    ) {
      throw new Error("VALIDATION_FAILED");
    }
    if (
      m.maxAmountMinor !== null &&
      m.maxAmountMinor !== undefined &&
      !/^\d+$/.test(m.maxAmountMinor)
    ) {
      throw new Error("VALIDATION_FAILED");
    }
    if (
      m.minAmountMinor !== null &&
      m.minAmountMinor !== undefined &&
      m.maxAmountMinor !== null &&
      m.maxAmountMinor !== undefined &&
      BigInt(m.minAmountMinor) > BigInt(m.maxAmountMinor)
    ) {
      throw new Error("VALIDATION_FAILED");
    }
  }

  async list(context: FundingRulesContext) {
    if (!context.roles.some((r) => READ_ROLES.has(r))) throw new Error("FORBIDDEN");
    return this.envelope(context, await this.store.list(context.organizationId));
  }

  async setDefault(
    context: FundingRulesContext,
    funding: FundingInputContract,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((r) => CONFIGURE_ROLES.has(r))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    this.assertFundingInput(funding);
    return this.envelope(context, await this.store.setDefault(context, funding, idempotencyKey));
  }

  async createRule(
    context: FundingRulesContext,
    input: CreateFundingRuleInput,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((r) => CONFIGURE_ROLES.has(r))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!input.name?.trim()) throw new Error("VALIDATION_FAILED");
    if (input.priority !== undefined && !Number.isInteger(input.priority)) {
      throw new Error("VALIDATION_FAILED");
    }
    this.assertFundingInput(input.target);
    this.assertRuleMatchers(input);
    return this.envelope(context, await this.store.createRule(context, input, idempotencyKey));
  }

  async updateRule(
    context: FundingRulesContext,
    ruleId: string,
    expectedVersion: string | undefined,
    input: UpdateFundingRuleInput,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((r) => CONFIGURE_ROLES.has(r))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");
    if (input.name !== undefined && !input.name.trim()) throw new Error("VALIDATION_FAILED");
    if (input.priority !== undefined && !Number.isInteger(input.priority)) {
      throw new Error("VALIDATION_FAILED");
    }
    if (input.target) this.assertFundingInput(input.target);
    this.assertRuleMatchers(input);
    return this.envelope(
      context,
      await this.store.updateRule(context, ruleId, expectedVersion, input, idempotencyKey),
    );
  }

  async deleteRule(
    context: FundingRulesContext,
    ruleId: string,
    expectedVersion: string | undefined,
    idempotencyKey?: string,
  ) {
    if (!context.roles.some((r) => CONFIGURE_ROLES.has(r))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (!expectedVersion) throw new Error("VERSION_CONFLICT");
    return this.envelope(
      context,
      await this.store.deleteRule(context, ruleId, expectedVersion, idempotencyKey),
    );
  }

  async test(context: FundingRulesContext, candidate: FundingRuleTestInput) {
    if (!context.roles.some((r) => READ_ROLES.has(r))) throw new Error("FORBIDDEN");
    if (candidate.explicitFunding) this.assertFundingInput(candidate.explicitFunding);
    return this.envelope(
      context,
      await this.resolveForIngestion(context.organizationId, candidate),
    );
  }

  /** Resolves funding for a newly ingested record when payload omits explicit funding. */
  async resolveForIngestion(organizationId: string, candidate: FundingRuleTestInput) {
    if (candidate.explicitFunding) {
      return matchFundingRule([], null, candidate);
    }
    let supplierTaxId = candidate.supplierTaxId;
    if (!supplierTaxId && candidate.partyId) {
      supplierTaxId = await this.store.findPartyTaxId(organizationId, candidate.partyId);
    }
    const { defaultFunding, rules } = await this.store.list(organizationId);
    return matchFundingRule(rules, defaultFunding, {
      ...candidate,
      ...(supplierTaxId ? { supplierTaxId } : {}),
    });
  }
}
