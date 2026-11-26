import { Inject, Injectable } from "@nestjs/common";
import {
  API_VERSION,
  type UpdateOrganizationCitPolicyRequest,
  type UpsertOrganizationCitRateTiersRequest,
} from "@naai-erp/contracts";
import { validateCitRateSchedule } from "@naai-erp/domain";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  CIT_POLICY_STORE,
  type CitEstimateQuery,
  type CitPolicyContext,
  type CitPolicyStore,
} from "./cit-policy.types.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WRITE_ROLES = new Set(["owner", "finance_admin", "accountant"]);

@Injectable()
export class CitPolicyService {
  constructor(
    @Inject(CIT_POLICY_STORE) private readonly store: CitPolicyStore,
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
  ) {}

  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }

  private envelope(context: CitPolicyContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }

  private assertCanWrite(context: CitPolicyContext) {
    if (!context.roles.some((role) => WRITE_ROLES.has(role))) {
      throw new Error("FORBIDDEN");
    }
  }

  parseEstimateQuery(raw: Record<string, string | undefined>): CitEstimateQuery {
    const todayStr = new Date().toISOString().slice(0, 10);
    const endsOn = (raw.endsOn ?? raw.to ?? todayStr).slice(0, 10);
    const startsOn = (raw.startsOn ?? raw.from ?? `${endsOn.slice(0, 4)}-01-01`).slice(0, 10);
    const asOf = raw.asOf ? raw.asOf.slice(0, 10) : undefined;
    if (!DATE.test(startsOn) || !DATE.test(endsOn) || startsOn > endsOn) {
      throw new Error("VALIDATION_FAILED");
    }
    if (asOf !== undefined && !DATE.test(asOf)) {
      throw new Error("VALIDATION_FAILED");
    }
    return { startsOn, endsOn, ...(asOf ? { asOf } : {}) };
  }

  parsePolicyInput(raw: Record<string, unknown>): UpdateOrganizationCitPolicyRequest {
    const payload =
      raw && typeof raw.data === "object" && raw.data !== null && !Array.isArray(raw.data)
        ? (raw.data as Record<string, unknown>)
        : raw;
    if (typeof payload.citSmallEnterpriseIneligible !== "boolean") {
      throw new Error("VALIDATION_FAILED");
    }
    const reason = String(payload.reason ?? "").trim();
    if (!reason) throw new Error("VALIDATION_FAILED");

    let priorYearRevenueOverrideMinor: string | null = null;
    if (
      payload.priorYearRevenueOverrideMinor !== undefined &&
      payload.priorYearRevenueOverrideMinor !== null &&
      String(payload.priorYearRevenueOverrideMinor).trim() !== ""
    ) {
      const rawMinor = String(payload.priorYearRevenueOverrideMinor).trim();
      if (!/^\d+$/.test(rawMinor)) throw new Error("VALIDATION_FAILED");
      priorYearRevenueOverrideMinor = rawMinor;
    }

    const ineligibilityReason =
      payload.ineligibilityReason == null
        ? null
        : String(payload.ineligibilityReason).trim() || null;

    return {
      citSmallEnterpriseIneligible: payload.citSmallEnterpriseIneligible,
      ineligibilityReason,
      priorYearRevenueOverrideMinor,
      reason,
    };
  }

  parseTiersInput(
    effectiveFromYearRaw: string,
    raw: Record<string, unknown>,
  ): { effectiveFromYear: number; input: UpsertOrganizationCitRateTiersRequest } {
    const effectiveFromYear = Number(effectiveFromYearRaw);
    if (
      !Number.isInteger(effectiveFromYear) ||
      effectiveFromYear < 1900 ||
      effectiveFromYear > 9999
    ) {
      throw new Error("VALIDATION_FAILED");
    }
    const payload =
      raw && typeof raw.data === "object" && raw.data !== null && !Array.isArray(raw.data)
        ? (raw.data as Record<string, unknown>)
        : raw;
    const reason = String(payload.reason ?? "").trim();
    if (!reason || !Array.isArray(payload.tiers) || !payload.tiers.length) {
      throw new Error("VALIDATION_FAILED");
    }
    const effectiveToYear =
      payload.effectiveToYear === undefined || payload.effectiveToYear === null
        ? null
        : Number(payload.effectiveToYear);
    if (effectiveToYear !== null && !Number.isInteger(effectiveToYear)) {
      throw new Error("VALIDATION_FAILED");
    }
    const lawReference = String(payload.lawReference ?? "Law 67/2025/QH15").trim();
    const tiers = payload.tiers.map((item, idx) => {
      const tier = (item ?? {}) as Record<string, unknown>;
      const tierCode = String(tier.tierCode ?? "").trim();
      const label = String(tier.label ?? "").trim();
      const rateBps = Number(tier.rateBps);
      let maxRevenueMinor: string | null = null;
      if (tier.maxRevenueMinor !== null && tier.maxRevenueMinor !== undefined) {
        const s = String(tier.maxRevenueMinor).trim();
        if (!/^\d+$/.test(s)) throw new Error("VALIDATION_FAILED");
        maxRevenueMinor = s;
      }
      if (!tierCode || !label || !Number.isInteger(rateBps)) {
        throw new Error("VALIDATION_FAILED");
      }
      return { tierOrder: idx + 1, tierCode, label, maxRevenueMinor, rateBps };
    });

    try {
      validateCitRateSchedule({
        effectiveFromYear,
        effectiveToYear,
        lawReference,
        standardRateBps: 2000,
        source: "organization",
        tiers: tiers.map((t) => ({
          ...t,
          maxRevenueMinor: t.maxRevenueMinor === null ? null : BigInt(t.maxRevenueMinor),
        })),
      });
    } catch {
      throw new Error("VALIDATION_FAILED");
    }

    return {
      effectiveFromYear,
      input: {
        effectiveToYear,
        lawReference,
        tiers: tiers.map(({ tierCode, label, maxRevenueMinor, rateBps }) => ({
          tierCode,
          label,
          maxRevenueMinor,
          rateBps,
        })),
        reason,
      },
    };
  }

  async getPolicy(context: CitPolicyContext, yearRaw?: string) {
    let taxYear: number | undefined;
    if (yearRaw !== undefined && yearRaw !== "") {
      taxYear = Number(yearRaw);
      if (!Number.isInteger(taxYear) || taxYear < 1900 || taxYear > 9999) {
        throw new Error("VALIDATION_FAILED");
      }
    }
    return this.envelope(context, await this.store.getPolicy(context.organizationId, taxYear));
  }

  async upsertPolicy(
    context: CitPolicyContext,
    rawBody: Record<string, unknown>,
    idempotencyKey?: string,
    ifMatch?: string,
  ) {
    this.assertCanWrite(context);
    if (!idempotencyKey?.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const parsed = this.parsePolicyInput(rawBody ?? {});
    const expectedVersion = ifMatch?.trim() ? ifMatch.trim().replace(/^"|"$/g, "") : undefined;
    if (expectedVersion !== undefined && !/^\d+$/.test(expectedVersion)) {
      throw new Error("VALIDATION_FAILED");
    }
    return this.envelope(
      context,
      await this.store.upsertPolicy(context, parsed, idempotencyKey.trim(), expectedVersion),
    );
  }

  async upsertRateTiers(
    context: CitPolicyContext,
    yearRaw: string,
    rawBody: Record<string, unknown>,
    idempotencyKey?: string,
  ) {
    this.assertCanWrite(context);
    if (!idempotencyKey?.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const { effectiveFromYear, input } = this.parseTiersInput(yearRaw, rawBody ?? {});
    return this.envelope(
      context,
      await this.store.upsertRateTiers(context, effectiveFromYear, input, idempotencyKey.trim()),
    );
  }

  async estimateReport(context: CitPolicyContext, rawQuery: Record<string, string | undefined>) {
    const query = this.parseEstimateQuery(rawQuery);
    return this.envelope(context, await this.store.estimateReport(context.organizationId, query));
  }
}
