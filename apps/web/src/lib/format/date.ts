const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatIsoDate(value: string | null | undefined): string {
  if (!value) return "—";
  const match = ISO_DATE.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatDateTime(
  value: string | Date | null | undefined,
  timeZone = "Asia/Ho_Chi_Minh",
): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
