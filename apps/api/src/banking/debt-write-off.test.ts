import { describe, expect, it, vi } from "vitest";
import {
  executeOwnerDebtWriteOff,
  executeSalesInvoiceBadDebtWriteOff,
} from "./debt-write-off.helper.js";

function mockPool(queries: Array<(sql: string, params?: unknown[]) => unknown>) {
  let idx = 0;
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql === "begin" || sql === "commit" || sql === "rollback") return { rows: [] };
      const fn = queries[idx++];
      if (!fn) throw new Error(`Unexpected SQL #${idx}: ${sql}`);
      return fn(sql, params);
    }),
    release: vi.fn(),
  };
  return { pool: { connect: vi.fn(async () => client) } as never, client };
}

const context = {
  organizationId: "naai",
  actorId: "owner-1",
  roles: ["owner"],
  correlationId: "corr-1",
};

describe("debt-write-off.helper", () => {
  it("validates owner debt write-off input and rejects exceeding balance", async () => {
    await expect(
      executeOwnerDebtWriteOff(
        {} as never,
        context,
        {
          schemaVersion: 1,
          bookingDate: "2026-11-27",
          amountMinor: "0",
          currency: "VND",
          description: "xóa nợ",
          reason: "miễn nợ",
        },
        "k1",
      ),
    ).rejects.toThrow("VALIDATION_FAILED");

    const { pool } = mockPool([
      () => ({ rows: [] }),
      () => ({ rows: [{ state: "open" }] }),
      () => ({ rows: [{ account_code: "3388-OWNER" }] }),
      () => ({ rows: [{ code: "411-CAPITAL" }] }),
      () => ({ rows: [{ balance: "1000000" }] }),
    ]);

    await expect(
      executeOwnerDebtWriteOff(
        pool,
        context,
        {
          schemaVersion: 1,
          bookingDate: "2026-11-27",
          amountMinor: "2000000",
          currency: "VND",
          description: "xóa nợ",
          reason: "miễn nợ",
        },
        "k2",
      ),
    ).rejects.toThrow("OWNER_DEBT_WRITE_OFF_EXCEEDS_BALANCE");
  });

  it("posts owner debt write-off Dr 3388-OWNER / Cr 411-CAPITAL", async () => {
    const { pool, client } = mockPool([
      () => ({ rows: [] }),
      () => ({ rows: [{ state: "open" }] }),
      () => ({ rows: [{ account_code: "3388-OWNER" }] }),
      () => ({ rows: [{ code: "411-CAPITAL" }] }),
      () => ({ rows: [{ balance: "5000000" }] }),
      () => ({ rows: [] }),
      () => ({ rows: [] }),
      () => ({ rows: [] }),
      () => ({ rows: [] }),
      () => ({ rows: [] }),
    ]);

    const res = await executeOwnerDebtWriteOff(
      pool,
      context,
      {
        schemaVersion: 1,
        bookingDate: "2026-11-27",
        amountMinor: "5000000",
        currency: "VND",
        description: "Chủ xóa nợ chi hộ chuyển vốn góp",
        reason: "Chủ miễn nợ",
      },
      "k3",
    );

    expect(res).toMatchObject({
      ownerAccountCode: "3388-OWNER",
      equityAccountCode: "411-CAPITAL",
      amountMinor: "5000000",
      state: "posted",
      idempotencyReplayed: false,
    });
    expect(client.query).toHaveBeenCalledWith("commit");
  });

  it("writes off sales invoice bad debt Dr 642-OPEX / Cr 131-AR and marks invoice paid", async () => {
    const { pool, client } = mockPool([
      () => ({ rows: [] }),
      () => ({ rows: [{ state: "open" }] }),
      () => ({
        rows: [
          {
            id: "sinv-8",
            type: "sales_invoice",
            state: "partially_paid",
            party_id: "p1",
            document_number: "8",
            currency: "VND",
            gross_minor: "6142500",
            control_account_code: "131-AR",
            version: "2",
          },
        ],
      }),
      () => ({ rows: [{ code: "642-OPEX" }] }),
      () => ({ rows: [{ settled: "4042500" }] }),
      () => ({ rows: [] }),
      () => ({ rows: [] }),
      () => ({ rows: [{ version: "3" }] }),
      () => ({ rows: [] }),
      () => ({ rows: [] }),
      () => ({ rows: [] }),
    ]);

    const res = await executeSalesInvoiceBadDebtWriteOff(
      pool,
      context,
      "sinv-8",
      {
        writeOffDate: "2026-11-27",
        amountMinor: "2100000",
        reason: "Khách hàng không trả được",
      },
      "k4",
    );

    expect(res).toMatchObject({
      documentId: "sinv-8",
      expenseAccountCode: "642-OPEX",
      controlAccountCode: "131-AR",
      amountMinor: "2100000",
      remainingOutstandingMinor: "0",
      documentState: "paid",
      resourceVersion: "3",
    });
    expect(client.query).toHaveBeenCalledWith("commit");
    const sqlStatements = client.query.mock.calls.map(([sql]) => String(sql));
    expect(sqlStatements.some((sql) => sql.includes("from api_idempotency_records"))).toBe(true);
    expect(sqlStatements.some((sql) => sql.includes("insert into api_idempotency_records"))).toBe(
      true,
    );
    expect(
      sqlStatements.some(
        (sql) => /\bidempotency_records\b/.test(sql) || sql.includes("status_code"),
      ),
    ).toBe(false);
  });
});
