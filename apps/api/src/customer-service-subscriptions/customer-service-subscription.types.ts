import type { JournalActorContext } from "../journals/journal.types.js";
export type CustomerSubscriptionContext = JournalActorContext;
export type CustomerSubscriptionStore = Readonly<{
  listPlans(
    c: CustomerSubscriptionContext,
    filters: Record<string, string | undefined>,
  ): Promise<unknown>;
  getPlan(c: CustomerSubscriptionContext, id: string): Promise<Record<string, unknown> | undefined>;
  createPlan(
    c: CustomerSubscriptionContext,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  updatePlan(
    c: CustomerSubscriptionContext,
    id: string,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  deactivatePlan(
    c: CustomerSubscriptionContext,
    id: string,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  deletePlan(
    c: CustomerSubscriptionContext,
    id: string,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  listSubscriptions(
    c: CustomerSubscriptionContext,
    filters: Record<string, string | undefined>,
  ): Promise<unknown>;
  getSubscription(
    c: CustomerSubscriptionContext,
    id: string,
  ): Promise<Record<string, unknown> | undefined>;
  createSubscription(
    c: CustomerSubscriptionContext,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  updateSubscription(
    c: CustomerSubscriptionContext,
    id: string,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  transition(
    c: CustomerSubscriptionContext,
    id: string,
    action: string,
    input: Record<string, unknown>,
    key: string,
  ): Promise<unknown>;
  validatePortable(
    c: CustomerSubscriptionContext,
    resource: "service_plans" | "customer_service_subscriptions",
    input: Record<string, unknown>,
  ): Promise<void>;
}>;
export const CUSTOMER_SUBSCRIPTION_STORE = Symbol("CUSTOMER_SUBSCRIPTION_STORE");
