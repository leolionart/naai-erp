import { describe, expect, it } from "vitest";
import { deriveCompanyFunds } from "./pg-operating-dashboard.store.js";

describe("deriveCompanyFunds", () => {
  it("adds bank, company-held cash and owner custody exactly once", () => {
    const result = deriveCompanyFunds({
      bankAvailableMinor: 100n,
      companyCashOnHandMinor: 250n,
      ownerHoldsCompanyFundsMinor: 650n,
      cashAndBankMinor: 1000n,
    });

    expect(result).toEqual({ totalMinor: 1000n, reconciliationGapMinor: 0n });
  });

  it("does not turn an unresolved negative residual into negative physical funds", () => {
    const result = deriveCompanyFunds({
      bankAvailableMinor: 0n,
      companyCashOnHandMinor: -13_176_000n,
      ownerHoldsCompanyFundsMinor: 15_086_850n,
      cashAndBankMinor: 1_910_850n,
    });

    expect(result.totalMinor).toBe(15_086_850n);
    // The shared ledger is lower than the partition because historical
    // custody provenance is incomplete; expose the exact reconciliation gap.
    expect(result.reconciliationGapMinor).toBe(-13_176_000n);
  });
});
