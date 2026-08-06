import { describe, expect, it, vi } from "vitest";
import { ExecutiveMetricService } from "./executive-metric.service.js";
const context = {
  organizationId: "org",
  actorId: "maker",
  roles: ["finance_admin"],
  correlationId: "req",
};
describe("ERP-640 executive metric service", () => {
  it("validates a controlled policy and requires idempotency", async () => {
    const store = {
      createPolicy: vi.fn().mockResolvedValue({ id: "p", version: 1 }),
      listPolicies: vi.fn(),
      getPolicy: vi.fn(),
      approvePolicy: vi.fn(),
      listDefinitions: vi.fn(),
      getDefinition: vi.fn(),
      createDefinition: vi.fn(),
      approveDefinition: vi.fn(),
      listFacts: vi.fn(),
      createFact: vi.fn(),
      reviewFact: vi.fn(),
      report: vi.fn(),
    };
    const service = new ExecutiveMetricService(store as never, {} as never);
    const input = service.parsePolicy({
      effectiveFrom: "2026-01-01",
      formulaVersion: "executive-metrics-v1",
      formulaPolicy: {
        averageBurnMonths: 3,
        equityConsumedDenominator: "contributed_capital",
        runwayCashSemantic: "unrestricted_cash",
        runwayFlowClass: "operating",
        signedRevenueDenominator: true,
      },
      changeReason: "Initial controlled policy",
      mappings: [{ semantic: "contributed_capital", accountCode: "411" }],
    });
    await expect(service.createPolicy(context as never, input)).rejects.toThrow(
      "IDEMPOTENCY_KEY_REQUIRED",
    );
    await expect(service.createPolicy(context as never, input, "key")).resolves.toMatchObject({
      organizationId: "org",
      data: { id: "p", version: 1 },
    });
  });
  it("keeps ROI facts nonnegative and purpose specific", () => {
    const service = new ExecutiveMetricService({} as never, {} as never);
    expect(() =>
      service.parseDefinition({
        purpose: "combined",
        name: "Bad",
        effectiveFrom: "2026-01-01",
        formulaVersion: "v1",
        includedCostPolicy: { includedKinds: [], excludedKinds: [] },
        changeReason: "bad",
      }),
    ).toThrow("VALIDATION_FAILED");
    expect(() =>
      service.parseFact({
        definitionId: "r",
        definitionVersion: 1,
        kind: "benefit",
        periodStartsOn: "2026-01-01",
        periodEndsOn: "2026-01-31",
        amountMinor: "-1",
        currency: "VND",
        sourceType: "manual",
        sourceId: "x",
      }),
    ).toThrow("VALIDATION_FAILED");
  });
});
