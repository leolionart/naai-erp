import type { CreateCommercialDocumentInput } from "./commercial-document.types.js";

export type PurchaseLineTaxDecision = Readonly<{
  managementState: string;
  citState: string;
  vatState: string;
  citEligibleMinor: string;
  vatEligibleMinor: string;
  reviewed: boolean;
}>;

export function purchaseLineTaxDecision(
  input: CreateCommercialDocumentInput,
  line: CreateCommercialDocumentInput["lines"][number],
  operatingMode: string | null,
): PurchaseLineTaxDecision {
  if (input.type !== "purchase_invoice")
    return {
      managementState: "unreviewed",
      citState: "unreviewed",
      vatState: "unreviewed",
      citEligibleMinor: "0",
      vatEligibleMinor: "0",
      reviewed: false,
    };

  const explicit = line.allocations.some(
    (allocation) => allocation.dimensions.taxState !== undefined,
  );
  let vatEligible = 0n;
  if (explicit && BigInt(line.taxMinor) > 0n) {
    let allocatedTax = 0n;
    for (const [index, allocation] of line.allocations.entries()) {
      const tax =
        index === line.allocations.length - 1
          ? BigInt(line.taxMinor) - allocatedTax
          : (BigInt(line.taxMinor) * BigInt(allocation.amountMinor)) / BigInt(line.netMinor);
      allocatedTax += tax;
      const state = allocation.dimensions.taxState;
      if (["eligible", "accountant_override"].includes(state ?? "")) vatEligible += tax;
      else if (state === "partially_eligible") {
        const requested = BigInt(allocation.dimensions.vatEligibleMinor ?? "0");
        vatEligible += requested > tax ? tax : requested;
      }
    }
  }

  const vatMinor = BigInt(line.taxMinor);
  const vatState =
    vatMinor === 0n || vatEligible === 0n
      ? "ineligible"
      : vatEligible === vatMinor
        ? "eligible"
        : "partially_eligible";
  return {
    managementState: operatingMode === "solopreneur" ? "valid" : "unreviewed",
    citState: "unreviewed",
    vatState: explicit ? vatState : "unreviewed",
    citEligibleMinor: "0",
    vatEligibleMinor: explicit ? vatEligible.toString() : "0",
    reviewed: explicit,
  };
}
