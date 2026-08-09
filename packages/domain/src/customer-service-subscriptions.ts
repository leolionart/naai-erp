export const SUBSCRIPTION_RECURRENCE_FREQUENCIES = ["month", "quarter", "year"] as const;
export type SubscriptionRecurrenceFrequency = (typeof SUBSCRIPTION_RECURRENCE_FREQUENCIES)[number];
export type SubscriptionLifecycle = "draft" | "active" | "paused" | "cancelled" | "expired";
export type SubscriptionAction = "activate" | "pause" | "resume" | "cancel" | "expire";

export type SubscriptionRecurrence = Readonly<{
  frequency: SubscriptionRecurrenceFrequency;
  interval: number;
  billingDay: number;
}>;

export type SubscriptionScheduleInput = Readonly<{
  startsOn: string;
  endsOn?: string | null;
  previewThrough: string;
  lifecycle: SubscriptionLifecycle;
  recurrence: SubscriptionRecurrence;
  quantity: string;
  unitPriceMinor: string;
  currency: string;
}>;

export type SubscriptionSchedulePeriod = Readonly<{
  sequence: number;
  serviceStartsOn: string;
  serviceEndsOn: string;
  billingOn: string;
  scheduledValueMinor: string;
  currency: string;
}>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d+$/;
const QUANTITY = /^\d+$/;

export function assertExactMoney(value: string): bigint {
  if (!MONEY.test(value)) throw new Error("SUBSCRIPTION_MONEY_INVALID");
  return BigInt(value);
}

export function assertRecurrence(value: SubscriptionRecurrence): SubscriptionRecurrence {
  if (!SUBSCRIPTION_RECURRENCE_FREQUENCIES.includes(value.frequency))
    throw new Error("SUBSCRIPTION_RECURRENCE_INVALID");
  if (!Number.isInteger(value.interval) || value.interval < 1 || value.interval > 120)
    throw new Error("SUBSCRIPTION_RECURRENCE_INVALID");
  if (!Number.isInteger(value.billingDay) || value.billingDay < 1 || value.billingDay > 31)
    throw new Error("SUBSCRIPTION_RECURRENCE_INVALID");
  return value;
}

export function subscriptionNextActions(
  state: SubscriptionLifecycle,
): readonly SubscriptionAction[] {
  if (state === "draft") return ["activate", "cancel"];
  if (state === "active") return ["pause", "cancel", "expire"];
  if (state === "paused") return ["resume", "cancel", "expire"];
  return [];
}

export function transitionSubscription(
  current: SubscriptionLifecycle,
  action: SubscriptionAction,
): SubscriptionLifecycle {
  const target: Partial<
    Record<SubscriptionLifecycle, Partial<Record<SubscriptionAction, SubscriptionLifecycle>>>
  > = {
    draft: { activate: "active", cancel: "cancelled" },
    active: { pause: "paused", cancel: "cancelled", expire: "expired" },
    paused: { resume: "active", cancel: "cancelled", expire: "expired" },
  };
  const next = target[current]?.[action];
  if (!next) throw new Error("SUBSCRIPTION_TRANSITION_INVALID");
  return next;
}

function parseDate(value: string): Date {
  if (!DATE.test(value)) throw new Error("SUBSCRIPTION_DATE_INVALID");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (date.toISOString().slice(0, 10) !== value) throw new Error("SUBSCRIPTION_DATE_INVALID");
  return date;
}

const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
function addMonthsClamped(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const first = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(date.getUTCDate(), lastDay)),
  );
}

function periodMonths(rule: SubscriptionRecurrence) {
  return (rule.frequency === "month" ? 1 : rule.frequency === "quarter" ? 3 : 12) * rule.interval;
}

function billingDate(periodStart: Date, billingDay: number) {
  const lastDay = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      periodStart.getUTCFullYear(),
      periodStart.getUTCMonth(),
      Math.min(billingDay, lastDay),
    ),
  );
}

export function buildSubscriptionSchedule(
  input: SubscriptionScheduleInput,
): readonly SubscriptionSchedulePeriod[] {
  assertRecurrence(input.recurrence);
  const quantity = assertExactMoney(input.quantity);
  const unitPrice = assertExactMoney(input.unitPriceMinor);
  if (quantity < 1n || !QUANTITY.test(input.quantity))
    throw new Error("SUBSCRIPTION_QUANTITY_INVALID");
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("SUBSCRIPTION_CURRENCY_INVALID");
  const startsOn = parseDate(input.startsOn);
  const previewThrough = parseDate(input.previewThrough);
  const endsOn = input.endsOn ? parseDate(input.endsOn) : previewThrough;
  if (endsOn < startsOn || previewThrough < startsOn)
    throw new Error("SUBSCRIPTION_DATE_RANGE_INVALID");
  if (
    input.lifecycle === "paused" ||
    input.lifecycle === "cancelled" ||
    input.lifecycle === "expired"
  )
    return [];
  const limit = endsOn < previewThrough ? endsOn : previewThrough;
  const periods: SubscriptionSchedulePeriod[] = [];
  let cursor = startsOn;
  while (cursor <= limit && periods.length < 600) {
    const next = addMonthsClamped(cursor, periodMonths(input.recurrence));
    const serviceEnd = addDays(next, -1) > limit ? limit : addDays(next, -1);
    periods.push({
      sequence: periods.length + 1,
      serviceStartsOn: iso(cursor),
      serviceEndsOn: iso(serviceEnd),
      billingOn: iso(billingDate(cursor, input.recurrence.billingDay)),
      scheduledValueMinor: (quantity * unitPrice).toString(),
      currency: input.currency,
    });
    cursor = next;
  }
  return periods;
}
