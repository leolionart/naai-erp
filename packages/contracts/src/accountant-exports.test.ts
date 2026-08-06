import { describe, expectTypeOf, it } from "vitest";
import type {
  AccountantExportContract,
  AccountantWorkbookContract,
  CreateAccountantExportRequest,
} from "./accountant-exports.js";
describe("ERP-650 export contracts", () => {
  it("keeps CSV/XLSX neutral workbook values and final state explicit", () => {
    expectTypeOf<CreateAccountantExportRequest["format"]>().toEqualTypeOf<"csv" | "xlsx">();
    expectTypeOf<AccountantWorkbookContract["sheets"][number]["rows"][number]>().toEqualTypeOf<
      Readonly<
        Record<
          string,
          {
            readonly value: null | boolean | number | string;
            readonly format?: "text" | "integer" | "money_minor" | "date" | "timestamp" | "boolean";
          }
        >
      >
    >();
    expectTypeOf<AccountantExportContract["isFinal"]>().toEqualTypeOf<boolean>();
    expectTypeOf<AccountantExportContract["contentHash"]>().toEqualTypeOf<string>();
    expectTypeOf<AccountantExportContract["sizeBytes"]>().toEqualTypeOf<string>();
  });
});
