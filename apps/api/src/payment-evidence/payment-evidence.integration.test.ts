import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../bootstrap.js";
import {
  authHeaders,
  buildTestExpensePayload,
  buildTestPurchaseInvoicePayload,
  seedPaymentEvidenceTestOrg,
} from "./payment-evidence.test-helper.js";

const enabled = process.env.RUN_DB_INTEGRATION === "1" && process.env.DATABASE_URL;
const describeIntegration = enabled ? describe : describe.skip;

describeIntegration("ERP-982 T-INT-PAY-001 payment evidence deductibility defaults", () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const organizationId = `org-pay001-${randomUUID().slice(0, 12)}`;
  let app: Awaited<ReturnType<typeof createApp>>;
  const ownerToken = `owner-pay001-${organizationId}`;
  const accountantToken = `acct-pay001-${organizationId}`;

  beforeAll(async () => {
    await seedPaymentEvidenceTestOrg(pool, organizationId, ownerToken, accountantToken);
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it("enforces threshold table, same-day supplier VAT aggregation, re-evaluation, reporting, and override boundaries", async () => {
    const policyRes = await app.inject({
      method: "GET",
      url: `/api/v1/organizations/${organizationId}/organization-workflow-policy`,
      headers: authHeaders(ownerToken),
    });
    expect(policyRes.statusCode).toBe(200);
    expect(policyRes.json().data.nonCashThresholdMinor).toBe("5000000");

    // 1) 4,999,999 VND cash expense (< 5,000,000) -> CIT & VAT eligible
    const underRes = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/expenses`,
      headers: authHeaders(ownerToken, "pay001-under"),
      payload: buildTestExpensePayload({
        id: "exp-under-5m",
        date: "2026-08-05",
        netMinor: "4545454",
        vatMinor: "454545",
        grossMinor: "4999999",
        paymentMethod: "cash",
        paidOn: "2026-08-05",
        transactionEvidence: "quote",
        externalId: "pl-under-5m",
      }),
    });
    expect(underRes.statusCode, underRes.body).toBe(201);
    expect(underRes.json().data.state).toBe("posted");
    const underDetail = (
      await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/expenses/exp-under-5m`,
        headers: authHeaders(ownerToken),
      })
    ).json().data;
    expect(underDetail.paymentEvidenceMissing).toBe(false);
    expect(underDetail.cit_state).toBe("eligible");
    expect(underDetail.vat_state).toBe("eligible");
    expect(underDetail.lines[0].citEligibleMinor).toBe("4545454");
    expect(underDetail.lines[0].vatEligibleMinor).toBe("454545");

    // 2) 5,000,000 VND cash expense (>= 5,000,000) -> NOT blocked, deductible 0 (unreviewed), flagged missing
    const cash5mRes = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/expenses`,
      headers: authHeaders(ownerToken, "pay001-cash5m"),
      payload: buildTestExpensePayload({
        id: "exp-cash-5m",
        date: "2026-08-06",
        netMinor: "4545455",
        vatMinor: "454545",
        grossMinor: "5000000",
        paymentMethod: "cash",
        paidOn: "2026-08-06",
        externalId: "pl-cash-5m",
      }),
    });
    expect(cash5mRes.statusCode, cash5mRes.body).toBe(201);
    expect(cash5mRes.json().data.state).toBe("posted");
    const cash5mDetail = (
      await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/expenses/exp-cash-5m`,
        headers: authHeaders(ownerToken),
      })
    ).json().data;
    expect(cash5mDetail.paymentEvidenceMissing).toBe(true);
    expect(cash5mDetail.cit_state).toBe("unreviewed");
    expect(cash5mDetail.vat_state).toBe("unreviewed");
    expect(cash5mDetail.lines[0].citEligibleMinor).toBe("0");
    expect(cash5mDetail.lines[0].vatEligibleMinor).toBe("0");

    // 3) 5,500,000 VND unpaid purchase invoice + owner_paid personal card with & without ref
    const unpaidInvRes = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/commercial-documents`,
      headers: authHeaders(ownerToken, "pay001-unpaid-inv"),
      payload: buildTestPurchaseInvoicePayload({
        id: "doc-unpaid-55m",
        documentNumber: "PI-UNPAID-01",
        date: "2026-08-07",
        dueDate: "2026-08-20",
        netMinor: "5000000",
        taxMinor: "500000",
        grossMinor: "5500000",
        controlAccountCode: "331-AP",
        funding: { type: "owner_paid" },
        externalId: "pl-doc-unpaid",
      }),
    });
    expect(unpaidInvRes.statusCode, unpaidInvRes.body).toBe(201);
    expect(unpaidInvRes.json().data.state).toBe("posted");

    const ownerNoRefRes = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/commercial-documents`,
      headers: authHeaders(ownerToken, "pay001-owner-noref"),
      payload: buildTestPurchaseInvoicePayload({
        id: "doc-owner-noref",
        documentNumber: "PI-OWNER-NOREF",
        date: "2026-08-08",
        netMinor: "5000000",
        taxMinor: "500000",
        grossMinor: "5500000",
        controlAccountCode: "3388-OWNER",
        funding: { type: "owner_paid" },
        paymentMethod: "card",
        paidOn: "2026-08-08",
      }),
    });
    expect(ownerNoRefRes.statusCode, ownerNoRefRes.body).toBe(201);
    const ownerNoRefDoc = (
      await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/commercial-documents/doc-owner-noref`,
        headers: authHeaders(ownerToken),
      })
    ).json().data;
    expect(ownerNoRefDoc.paymentEvidenceMissing).toBe(true);
    expect(ownerNoRefDoc.lines[0].citState).toBe("unreviewed");

    const ownerWithRefRes = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/commercial-documents`,
      headers: authHeaders(ownerToken, "pay001-owner-withref"),
      payload: buildTestPurchaseInvoicePayload({
        id: "doc-owner-withref",
        documentNumber: "PI-OWNER-WITHREF",
        date: "2026-08-09",
        netMinor: "5000000",
        taxMinor: "500000",
        grossMinor: "5500000",
        controlAccountCode: "3388-OWNER",
        funding: { type: "owner_paid" },
        paymentMethod: "card",
        paidOn: "2026-08-09",
        paymentEvidenceRef: "VISA-AUTH-998811",
        transactionEvidence: "contract",
      }),
    });
    expect(ownerWithRefRes.statusCode, ownerWithRefRes.body).toBe(201);
    const ownerWithRefDoc = (
      await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/commercial-documents/doc-owner-withref`,
        headers: authHeaders(ownerToken),
      })
    ).json().data;
    expect(ownerWithRefDoc.paymentEvidenceMissing).toBe(false);
    expect(ownerWithRefDoc.lines[0].citState).toBe("eligible");
    expect(ownerWithRefDoc.lines[0].vatState).toBe("eligible");

    // 4) Same-day same-supplier VAT aggregation (2,800,000 cash + 2,500,000 bank_transfer = 5,300,000 >= 5,000,000)
    await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/commercial-documents`,
      headers: authHeaders(ownerToken, "pay001-sameday-1"),
      payload: buildTestPurchaseInvoicePayload({
        id: "doc-sameday-cash",
        documentNumber: "PI-SD-01",
        partyId: "SUP-02",
        date: "2026-08-12",
        netMinor: "2545455",
        taxMinor: "254545",
        grossMinor: "2800000",
        controlAccountCode: "111-CASH",
        funding: { type: "owner_paid" },
        paymentMethod: "cash",
        paidOn: "2026-08-12",
      }),
    });
    await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/commercial-documents`,
      headers: authHeaders(ownerToken, "pay001-sameday-2"),
      payload: buildTestPurchaseInvoicePayload({
        id: "doc-sameday-bank",
        documentNumber: "PI-SD-02",
        partyId: "SUP-02",
        date: "2026-08-12",
        netMinor: "2272727",
        taxMinor: "227273",
        grossMinor: "2500000",
        controlAccountCode: "112-BANK",
        fundingSource: { type: "financial_account", financialAccountId: "BANK-01" },
        paymentMethod: "bank_transfer",
        paidOn: "2026-08-12",
        paymentEvidenceRef: "VCB-SD-02",
      }),
    });

    const sdCashAfter = (
      await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/commercial-documents/doc-sameday-cash`,
        headers: authHeaders(ownerToken),
      })
    ).json().data;
    expect(sdCashAfter.paymentEvidenceMissing).toBe(true);
    expect(sdCashAfter.lines[0].citState).toBe("eligible");
    expect(sdCashAfter.lines[0].vatState).toBe("unreviewed");
    expect(sdCashAfter.lines[0].vatEligibleMinor).toBe("0");

    // 5) Payment-evidence-gaps report + tax reports + operating dashboard surfacing
    const gapsBefore = (
      await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/reports/tax/payment-evidence-gaps?startsOn=2026-08-01&endsOn=2026-08-31`,
        headers: authHeaders(ownerToken),
      })
    ).json().data;
    expect(gapsBefore.status).toBe("warning");
    expect(gapsBefore.counts.recordCount).toBe(4);
    expect(
      gapsBefore.items.find((i: { sourceId: string }) => i.sourceId === "doc-sameday-cash")
        .gapReasons,
    ).toContain("same_day_supplier_vat_threshold");

    const asOfInstant = encodeURIComponent(new Date(Date.now() + 60_000).toISOString());
    const vatRep = (
      await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/reports/tax/vat-reconciliation?startsOn=2026-08-01&endsOn=2026-08-31&asOfInstant=${asOfInstant}`,
        headers: authHeaders(ownerToken),
      })
    ).json().data;
    expect(vatRep.paymentEvidenceGaps.status).toBe("warning");
    expect(
      vatRep.items.find((i: { sourceId: string }) => i.sourceId === "exp-cash-5m").exceptionCodes,
    ).toContain("PAYMENT_EVIDENCE_MISSING");

    const expExcRep = (
      await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/reports/tax/expense-exceptions?startsOn=2026-08-01&endsOn=2026-08-31&state=exception&asOfInstant=${asOfInstant}`,
        headers: authHeaders(ownerToken),
      })
    ).json().data;
    expect(expExcRep.paymentEvidenceGaps.status).toBe("warning");
    expect(
      expExcRep.items.find((i: { expense_id: string }) => i.expense_id === "exp-cash-5m")
        .exceptionCodes,
    ).toContain("PAYMENT_EVIDENCE_MISSING");

    const dashRep = (
      await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/reports/operating-dashboard?asOf=2026-08-31&startsOn=2026-08-01&endsOn=2026-08-31`,
        headers: authHeaders(ownerToken),
      })
    ).json().data;
    expect(dashRep.financials.configurationWarnings).toContain("payment_evidence_missing");
    expect(dashRep.financials.paymentEvidenceGaps.recordCount).toBe(4);

    // 6) Re-evaluate unpaid -> bank_transfer + paid_on via PATCH .../payment-evidence
    const unpaidDocCurrent = (
      await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/commercial-documents/doc-unpaid-55m`,
        headers: authHeaders(ownerToken),
      })
    ).json().data;
    const patchPaidRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/organizations/${organizationId}/commercial-documents/doc-unpaid-55m/payment-evidence`,
      headers: authHeaders(ownerToken, "pay001-patch-paid", String(unpaidDocCurrent.version)),
      payload: {
        paymentMethod: "bank_transfer",
        paidOn: "2026-08-18",
        paymentEvidenceRef: "OWNER-UNC-5500K",
        transactionEvidence: "contract",
        reason: "Uploaded bank transfer receipt",
      },
    });
    expect(patchPaidRes.statusCode, patchPaidRes.body).toBe(200);
    expect(patchPaidRes.json().data.paymentEvidenceMissing).toBe(false);
    expect(patchPaidRes.json().data.lines[0].citState).toBe("eligible");
    expect(patchPaidRes.json().data.lines[0].vatState).toBe("eligible");

    // 7) Strict override boundary: non-override review rejected; tax-finalization skips; accountant_override + reference works
    const shortcutAttempt = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/expenses/exp-cash-5m/review`,
      headers: authHeaders(accountantToken, "pay001-shortcut-reject"),
      payload: {
        axis: "cit",
        lineNumber: 1,
        state: "eligible",
        eligibleMinor: "4545455",
        reason: "Try shortcut without payment evidence",
      },
    });
    expect(shortcutAttempt.statusCode).toBe(422);
    expect(shortcutAttempt.json().error.code).toBe("PAYMENT_EVIDENCE_REQUIRED");

    const finalizeDryRun = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/expenses/tax-finalization/dry-run`,
      headers: authHeaders(ownerToken, "pay001-finalize-dry"),
      payload: { reason: "Batch finalize check" },
    });
    expect(finalizeDryRun.statusCode).toBe(201);
    expect(finalizeDryRun.json().data.items).toEqual([]);

    const overrideNoRef = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/expenses/exp-cash-5m/review`,
      headers: authHeaders(accountantToken, "pay001-override-noref"),
      payload: {
        axis: "cit",
        lineNumber: 1,
        state: "accountant_override",
        eligibleMinor: "4545455",
        reason: "Missing reference",
      },
    });
    expect(overrideNoRef.statusCode).toBe(422);
    expect(overrideNoRef.json().error.code).toBe("ACCOUNTANT_OVERRIDE_REFERENCE_REQUIRED");

    const overrideWithRef = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/expenses/exp-cash-5m/review`,
      headers: authHeaders(accountantToken, "pay001-override-ok"),
      payload: {
        axis: "cit",
        lineNumber: 1,
        state: "accountant_override",
        eligibleMinor: "4545455",
        reference: "TAX-MEMO-2026-08",
        reason: "Audited statutory exception",
      },
    });
    expect(overrideWithRef.statusCode, overrideWithRef.body).toBe(201);

    // 8) Configurable threshold via PATCH /organization-workflow-policy
    const updatePolicyRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/organizations/${organizationId}/organization-workflow-policy`,
      headers: authHeaders(ownerToken, "pay001-threshold-2m"),
      payload: { nonCashThresholdMinor: "2000000", reason: "Lower internal non-cash policy" },
    });
    expect(updatePolicyRes.statusCode, updatePolicyRes.body).toBe(200);
    expect(updatePolicyRes.json().data.nonCashThresholdMinor).toBe("2000000");

    const customThreshExp = await app.inject({
      method: "POST",
      url: `/api/v1/organizations/${organizationId}/expenses`,
      headers: authHeaders(ownerToken, "pay001-custom-22m"),
      payload: buildTestExpensePayload({
        id: "exp-cash-22m",
        date: "2026-08-22",
        netMinor: "2000000",
        vatMinor: "200000",
        grossMinor: "2200000",
        paymentMethod: "cash",
        paidOn: "2026-08-22",
        externalId: "pl-cash-22m",
      }),
    });
    expect(customThreshExp.statusCode).toBe(201);
    const customDetail = (
      await app.inject({
        method: "GET",
        url: `/api/v1/organizations/${organizationId}/expenses/exp-cash-22m`,
        headers: authHeaders(ownerToken),
      })
    ).json().data;
    expect(customDetail.paymentEvidenceMissing).toBe(true);
    expect(customDetail.cit_state).toBe("unreviewed");
  });
});
