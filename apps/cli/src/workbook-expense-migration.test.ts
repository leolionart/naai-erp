import { describe, expect, it } from "vitest";
import { workbookExpenseMigrationErrors } from "./workbook-expense-migration.js";

const valid = {
  id: "expense-1",
  sourceRowIndex: 2,
  amountMinor: "110",
  taxMinor: "10",
  payeePartyId: "supplier-1",
  date: "2026-08-06",
  currency: "VND",
  businessPurpose: "Hosting",
};

describe("workbook expense migration preflight", () => {
  it("accepts a valid positive expense and skips zero-value markers", () => {
    expect(workbookExpenseMigrationErrors([valid, { ...valid, amountMinor: "0" }])).toEqual([]);
  });

  it("rejects payloads that would fail the commercial document contract", () => {
    expect(
      workbookExpenseMigrationErrors([
        {
          ...valid,
          amountMinor: "10",
          taxMinor: "10",
          payeePartyId: "",
          date: "06/08/2026",
          currency: "vnd",
          businessPurpose: "",
        },
      ]),
    ).toEqual([
      "row 2: require gross > tax >= 0",
      "row 2: missing payeePartyId",
      "row 2: invalid expense date",
      "row 2: invalid currency",
      "row 2: missing businessPurpose",
    ]);
  });
});
