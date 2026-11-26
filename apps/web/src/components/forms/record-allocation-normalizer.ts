type Row = Record<string, unknown>;

export function normalizeExistingAllocations(
  existingAllocations: readonly Row[],
  singleLineNetMinor: string,
  buildDimensions: (rawDimensions: Row | undefined) => Record<string, unknown>,
): Row[] {
  return existingAllocations.map((allocation, index) => {
    const rawDims =
      allocation.dimensions && typeof allocation.dimensions === "object"
        ? { ...(allocation.dimensions as Row) }
        : undefined;
    const embeddedId = rawDims?.allocationId;
    if (rawDims) {
      delete rawDims.allocationId;
    }
    const idCandidate =
      allocation.id ?? embeddedId ?? allocation.allocationNumber ?? allocation.allocation_number;
    const id =
      typeof idCandidate === "string" && idCandidate.trim()
        ? idCandidate.trim()
        : typeof idCandidate === "number"
          ? `alloc-${idCandidate}`
          : `alloc-${index + 1}`;
    const amountMinor =
      existingAllocations.length === 1
        ? singleLineNetMinor || "0"
        : String(allocation.amountMinor ?? allocation.amount_minor ?? "0");
    return {
      id,
      amountMinor,
      dimensions: buildDimensions(rawDims),
    };
  });
}
