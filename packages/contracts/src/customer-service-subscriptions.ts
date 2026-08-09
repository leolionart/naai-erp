export const CUSTOMER_SERVICE_SUBSCRIPTION_CONTRACT_VERSION = 1 as const;
export type RecurrenceRuleContract = Readonly<{
  frequency: "month" | "quarter" | "year";
  interval: number;
  billingDay: number;
}>;
export type ServicePlanContract = Readonly<{
  id: string;
  code: string;
  name: string;
  serviceLineCode: string;
  defaultUnitPriceMinor: string;
  currency: string;
  recurrence: RecurrenceRuleContract;
  active: boolean;
  resourceVersion: string;
  nextActions: readonly ("update" | "deactivate")[];
}>;
export type CustomerServiceSubscriptionContract = Readonly<{
  id: string;
  customerPartyId: string;
  servicePlanId: string;
  projectId: string | null;
  startsOn: string;
  endsOn: string | null;
  quantity: string;
  unitPriceMinor: string;
  currency: string;
  recurrenceSnapshot: RecurrenceRuleContract;
  lifecycle: "draft" | "active" | "paused" | "cancelled" | "expired";
  resourceVersion: string;
  nextActions: readonly (
    "update" | "activate" | "pause" | "resume" | "cancel" | "expire" | "schedule-preview"
  )[];
}>;
export type CreateServicePlanRequest = Readonly<{
  schemaVersion: 1;
  id?: string;
  code: string;
  name: string;
  serviceLineCode: string;
  defaultUnitPriceMinor: string;
  currency: string;
  recurrence: RecurrenceRuleContract;
  reason: string;
}>;
export type UpdateServicePlanRequest = Readonly<
  Partial<Omit<CreateServicePlanRequest, "schemaVersion" | "id">> & {
    schemaVersion: 1;
    reason: string;
  }
>;
export type CreateCustomerServiceSubscriptionRequest = Readonly<{
  schemaVersion: 1;
  id?: string;
  customerPartyId: string;
  servicePlanId: string;
  projectId?: string | null;
  startsOn: string;
  endsOn?: string | null;
  quantity: string;
  unitPriceMinor?: string;
  currency?: string;
  recurrence?: RecurrenceRuleContract;
  reason: string;
}>;
export type UpdateCustomerServiceSubscriptionRequest = Readonly<
  Partial<Omit<CreateCustomerServiceSubscriptionRequest, "schemaVersion" | "id">> & {
    schemaVersion: 1;
    reason: string;
  }
>;
export type CustomerSubscriptionLifecycleActionRequest = Readonly<{
  schemaVersion: 1;
  effectiveOn: string;
  reason: string;
}>;
export type SubscriptionSchedulePreviewContract = Readonly<{
  accountingNeutral: true;
  subscriptionId: string;
  generatedThrough: string;
  periods: readonly Readonly<{
    sequence: number;
    serviceStartsOn: string;
    serviceEndsOn: string;
    billingOn: string;
    scheduledValueMinor: string;
    currency: string;
  }>[];
}>;
