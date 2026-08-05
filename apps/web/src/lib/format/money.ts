export type ExactInteger = bigint | string | number;

export function exactBigInt(value: ExactInteger): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Amount number must be a safe integer");
    return BigInt(value);
  }
  if (!/^-?\d+$/.test(value.trim())) throw new Error("Amount must be an exact integer string");
  return BigInt(value.trim());
}

export function formatMinorVnd(value: ExactInteger | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(exactBigInt(value))} ₫`;
}

export function formatExactInteger(value: ExactInteger | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(exactBigInt(value));
}
