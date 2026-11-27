export const amount = (value: unknown) => BigInt(String(value ?? 0));
export const ratioBps = (part: bigint, total: bigint) =>
  total > 0n ? Number((part * 10_000n + total / 2n) / total) : null;
