export type RecognitionMethod =
  "milestone_acceptance" | "percentage_of_completion" | "time_and_materials" | "manual_reviewed";
export type RecognitionPolicyState = "draft" | "approved" | "retired";
export type MilestoneAcceptanceState = "pending" | "accepted" | "disputed" | "rejected";
export type RecognitionEventState = "draft" | "submitted" | "approved" | "posted" | "reversed";

export type RevenueRecognitionPolicy = Readonly<{
  organizationId: string;
  id: string;
  projectId: string;
  contractId: string;
  method: RecognitionMethod;
  effectiveFrom: string;
  effectiveTo?: string;
  revenueAccountCode: string;
  deferredRevenueAccountCode: string;
  contractAssetAccountCode?: string;
  evidenceRequirements: readonly string[];
  state: RecognitionPolicyState;
  version: number;
  approvedBy?: string;
}>;

export type MilestoneAcceptance = Readonly<{
  organizationId: string;
  id: string;
  milestoneId: string;
  milestoneAmountMinor: bigint;
  state: MilestoneAcceptanceState;
  acceptedAmountMinor?: bigint;
  acceptedPercentage?: string;
  acceptedOn?: string;
  evidenceIds: readonly string[];
  reason: string;
  version: number;
  reviewedBy?: string;
}>;

export type RevenueRecognitionEvent = Readonly<{
  organizationId: string;
  id: string;
  projectId: string;
  contractId: string;
  milestoneId?: string;
  policyVersionId: string;
  recognitionDate: string;
  currency: string;
  amountMinor: bigint;
  baseAmountMinor: bigint;
  accountingRoute: "deferred_revenue" | "contract_asset";
  sourceEvidenceIds: readonly string[];
  state: RecognitionEventState;
  version: number;
  submittedBy?: string;
  approvedBy?: string;
  journalId?: string;
  reversalJournalId?: string;
}>;

export type RecognitionJournalLine = Readonly<{
  accountCode: string;
  debitMinor?: bigint;
  creditMinor?: bigint;
  projectId: string;
  recognitionEventId: string;
}>;

export type ProjectRevenueAxisMovement = Readonly<{
  projectId: string;
  effectiveOn: string;
  currency: string;
  recognizedNetMinor?: bigint;
  invoicedNetMinor?: bigint;
  collectedGrossMinor?: bigint;
  collectedNetMinor?: bigint;
  deferredRevenueMinor?: bigint;
  contractAssetMinor?: bigint;
  recognitionEventId?: string;
  invoiceId?: string;
  reconciliationId?: string;
  journalId?: string;
}>;

export type ProjectRevenueAxes = Readonly<{
  projectId: string;
  startsOn: string;
  endsOn: string;
  currency: string;
  recognizedNetMinor: bigint;
  invoicedNetMinor: bigint;
  collectedGrossMinor: bigint;
  collectedNetMinor: bigint;
  deferredRevenueMinor: bigint;
  contractAssetMinor: bigint;
  recognitionEventIds: readonly string[];
  invoiceIds: readonly string[];
  reconciliationIds: readonly string[];
  journalIds: readonly string[];
}>;

const required = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};

function isoDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO date`);
  }
  return value;
}

function currency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Recognition currency must be ISO-4217");
  return normalized;
}

function percentUnits(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/.test(value)) {
    throw new Error("Acceptance percentage must be an exact decimal from 0 to 100");
  }
  const [whole = "0", fraction = ""] = value.split(".");
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (units <= 0n || units > 100_000_000n)
    throw new Error("Acceptance percentage must be greater than 0 and at most 100");
  return units;
}

export function createRevenueRecognitionPolicy(
  input: Omit<RevenueRecognitionPolicy, "state" | "version" | "approvedBy">,
): RevenueRecognitionPolicy {
  isoDate(input.effectiveFrom, "Recognition policy effective-from");
  if (
    input.effectiveTo &&
    isoDate(input.effectiveTo, "Recognition policy effective-to") < input.effectiveFrom
  ) {
    throw new Error("Recognition policy effective-to cannot precede effective-from");
  }
  return Object.freeze({
    ...input,
    organizationId: required(input.organizationId, "Recognition policy organization ID"),
    id: required(input.id, "Recognition policy ID"),
    projectId: required(input.projectId, "Recognition policy project ID"),
    contractId: required(input.contractId, "Recognition policy contract ID"),
    revenueAccountCode: required(input.revenueAccountCode, "Revenue account"),
    deferredRevenueAccountCode: required(
      input.deferredRevenueAccountCode,
      "Deferred revenue account",
    ),
    evidenceRequirements: Object.freeze([...new Set(input.evidenceRequirements)].sort()),
    state: "draft",
    version: 1,
  });
}

function policiesOverlap(left: RevenueRecognitionPolicy, right: RevenueRecognitionPolicy): boolean {
  return (
    (left.effectiveTo ?? "9999-12-31") >= right.effectiveFrom &&
    (right.effectiveTo ?? "9999-12-31") >= left.effectiveFrom
  );
}

export function approveRevenueRecognitionPolicy(
  policy: RevenueRecognitionPolicy,
  existing: readonly RevenueRecognitionPolicy[],
  actorId: string,
): RevenueRecognitionPolicy {
  if (policy.state !== "draft") throw new Error("Only draft recognition policy can be approved");
  if (
    existing.some(
      (candidate) =>
        candidate.organizationId === policy.organizationId &&
        candidate.contractId === policy.contractId &&
        candidate.state === "approved" &&
        policiesOverlap(candidate, policy),
    )
  ) {
    throw new Error("Approved recognition policy ranges cannot overlap");
  }
  return Object.freeze({
    ...policy,
    state: "approved",
    version: policy.version + 1,
    approvedBy: required(actorId, "Recognition policy approver"),
  });
}

export function retireRevenueRecognitionPolicy(
  policy: RevenueRecognitionPolicy,
): RevenueRecognitionPolicy {
  if (policy.state !== "approved")
    throw new Error("Only approved recognition policy can be retired");
  return Object.freeze({ ...policy, state: "retired", version: policy.version + 1 });
}

export function resolveRevenueRecognitionPolicy(
  policies: readonly RevenueRecognitionPolicy[],
  organizationId: string,
  contractId: string,
  recognitionDateInput: string,
): RevenueRecognitionPolicy {
  const recognitionDate = isoDate(recognitionDateInput, "Recognition date");
  const matches = policies.filter(
    (policy) =>
      policy.organizationId === organizationId &&
      policy.contractId === contractId &&
      policy.state === "approved" &&
      policy.effectiveFrom <= recognitionDate &&
      (policy.effectiveTo ?? "9999-12-31") >= recognitionDate,
  );
  if (matches.length !== 1)
    throw new Error(
      matches.length ? "RECOGNITION_POLICY_AMBIGUOUS" : "RECOGNITION_POLICY_NOT_FOUND",
    );
  return matches[0]!;
}

export function createMilestoneAcceptance(input: {
  organizationId: string;
  id: string;
  milestoneId: string;
  milestoneAmountMinor: bigint;
  reason: string;
}): MilestoneAcceptance {
  if (input.milestoneAmountMinor <= 0n) throw new Error("Milestone amount must be positive");
  return Object.freeze({
    organizationId: required(input.organizationId, "Milestone acceptance organization ID"),
    id: required(input.id, "Milestone acceptance ID"),
    milestoneId: required(input.milestoneId, "Milestone ID"),
    milestoneAmountMinor: input.milestoneAmountMinor,
    state: "pending",
    evidenceIds: Object.freeze([]),
    reason: required(input.reason, "Milestone acceptance reason"),
    version: 1,
  });
}

export function acceptMilestone(input: {
  acceptance: MilestoneAcceptance;
  actorId: string;
  acceptedOn: string;
  acceptedAmountMinor?: bigint;
  acceptedPercentage?: string;
  evidenceIds: readonly string[];
  reason: string;
}): MilestoneAcceptance {
  if (input.acceptance.state !== "pending" && input.acceptance.state !== "disputed") {
    throw new Error("Only pending or disputed milestone can be accepted");
  }
  if (!input.evidenceIds.length) throw new Error("Milestone acceptance requires evidence");
  if ((input.acceptedAmountMinor === undefined) === (input.acceptedPercentage === undefined)) {
    throw new Error("Acceptance requires exactly one amount or percentage");
  }
  const acceptedAmountMinor =
    input.acceptedAmountMinor ??
    (input.acceptance.milestoneAmountMinor * percentUnits(input.acceptedPercentage!)) /
      100_000_000n;
  if (acceptedAmountMinor <= 0n || acceptedAmountMinor > input.acceptance.milestoneAmountMinor) {
    throw new Error("Accepted milestone amount exceeds eligible value");
  }
  return Object.freeze({
    ...input.acceptance,
    state: "accepted",
    acceptedAmountMinor,
    ...(input.acceptedPercentage ? { acceptedPercentage: input.acceptedPercentage } : {}),
    acceptedOn: isoDate(input.acceptedOn, "Milestone accepted date"),
    evidenceIds: Object.freeze([...new Set(input.evidenceIds)].sort()),
    reason: required(input.reason, "Milestone acceptance reason"),
    reviewedBy: required(input.actorId, "Milestone reviewer"),
    version: input.acceptance.version + 1,
  });
}

export function reviewMilestoneAcceptance(
  acceptance: MilestoneAcceptance,
  state: "disputed" | "rejected",
  actorId: string,
  reason: string,
): MilestoneAcceptance {
  if (acceptance.state !== "pending")
    throw new Error("Only pending milestone can be disputed or rejected");
  return Object.freeze({
    ...acceptance,
    state,
    reason: required(reason, "Milestone review reason"),
    reviewedBy: required(actorId, "Milestone reviewer"),
    version: acceptance.version + 1,
  });
}

export function createRevenueRecognitionEvent(input: {
  organizationId: string;
  id: string;
  projectId: string;
  contractId: string;
  milestoneId?: string;
  policy: RevenueRecognitionPolicy;
  acceptance?: MilestoneAcceptance;
  recognitionDate: string;
  currency: string;
  amountMinor: bigint;
  baseAmountMinor: bigint;
  priorRecognizedMinor: bigint;
  eligibleAmountMinor: bigint;
  accountingRoute: RevenueRecognitionEvent["accountingRoute"];
  sourceEvidenceIds: readonly string[];
}): RevenueRecognitionEvent {
  const recognitionDate = isoDate(input.recognitionDate, "Recognition date");
  if (input.policy.state !== "approved" || input.policy.contractId !== input.contractId) {
    throw new Error("Recognition event requires its effective approved policy");
  }
  if (
    input.policy.effectiveFrom > recognitionDate ||
    (input.policy.effectiveTo ?? "9999-12-31") < recognitionDate
  ) {
    throw new Error("Recognition policy is not effective on recognition date");
  }
  if (input.policy.method === "milestone_acceptance") {
    if (!input.acceptance || input.acceptance.state !== "accepted") {
      throw new Error("Milestone recognition requires accepted milestone evidence");
    }
    if (input.acceptance.milestoneId !== input.milestoneId)
      throw new Error("Recognition milestone mismatch");
  }
  const evidence = [...new Set(input.sourceEvidenceIds)].sort();
  const missing = input.policy.evidenceRequirements.filter(
    (requirement) => !evidence.includes(requirement),
  );
  if (missing.length) throw new Error(`Missing recognition evidence: ${missing.join(", ")}`);
  if (input.amountMinor <= 0n || input.baseAmountMinor <= 0n || input.priorRecognizedMinor < 0n) {
    throw new Error("Recognition amounts must be positive and prior amount non-negative");
  }
  if (input.priorRecognizedMinor + input.amountMinor > input.eligibleAmountMinor) {
    throw new Error("Cumulative recognition exceeds eligible contract or milestone value");
  }
  if (input.accountingRoute === "contract_asset" && !input.policy.contractAssetAccountCode) {
    throw new Error("Contract-asset recognition requires a configured contract asset account");
  }
  return Object.freeze({
    organizationId: required(input.organizationId, "Recognition organization ID"),
    id: required(input.id, "Recognition event ID"),
    projectId: required(input.projectId, "Recognition project ID"),
    contractId: required(input.contractId, "Recognition contract ID"),
    ...(input.milestoneId ? { milestoneId: input.milestoneId } : {}),
    policyVersionId: input.policy.id,
    recognitionDate,
    currency: currency(input.currency),
    amountMinor: input.amountMinor,
    baseAmountMinor: input.baseAmountMinor,
    accountingRoute: input.accountingRoute,
    sourceEvidenceIds: Object.freeze(evidence),
    state: "draft",
    version: 1,
  });
}

export function buildRecognitionJournalLines(
  event: RevenueRecognitionEvent,
  policy: RevenueRecognitionPolicy,
): readonly RecognitionJournalLine[] {
  if (event.policyVersionId !== policy.id) throw new Error("Recognition policy version mismatch");
  const debitAccount =
    event.accountingRoute === "deferred_revenue"
      ? policy.deferredRevenueAccountCode
      : policy.contractAssetAccountCode!;
  return Object.freeze([
    Object.freeze({
      accountCode: debitAccount,
      debitMinor: event.baseAmountMinor,
      projectId: event.projectId,
      recognitionEventId: event.id,
    }),
    Object.freeze({
      accountCode: policy.revenueAccountCode,
      creditMinor: event.baseAmountMinor,
      projectId: event.projectId,
      recognitionEventId: event.id,
    }),
  ]);
}

function transitionEvent(
  event: RevenueRecognitionEvent,
  expected: RecognitionEventState,
  state: RecognitionEventState,
  actorId: string,
): RevenueRecognitionEvent {
  if (event.state !== expected)
    throw new Error(`Invalid recognition transition: ${event.state} -> ${state}`);
  const actor = required(actorId, "Recognition actor");
  return Object.freeze({
    ...event,
    state,
    version: event.version + 1,
    ...(state === "submitted" ? { submittedBy: actor } : {}),
    ...(state === "approved" ? { approvedBy: actor } : {}),
  });
}

export const submitRevenueRecognitionEvent = (event: RevenueRecognitionEvent, actorId: string) =>
  transitionEvent(event, "draft", "submitted", actorId);

export function approveRevenueRecognitionEvent(
  event: RevenueRecognitionEvent,
  actorId: string,
  allowSelfApproval = false,
): RevenueRecognitionEvent {
  if (!allowSelfApproval && event.submittedBy === actorId)
    throw new Error("RECOGNITION_MAKER_CHECKER_VIOLATION");
  return transitionEvent(event, "submitted", "approved", actorId);
}

export function postRevenueRecognitionEvent(
  event: RevenueRecognitionEvent,
  input: {
    actorId: string;
    journalId: string;
    periodState: "open" | "soft_locked" | "hard_locked";
    roles: readonly string[];
  },
): RevenueRecognitionEvent {
  if (input.periodState === "hard_locked") throw new Error("PERIOD_HARD_LOCKED");
  if (
    input.periodState === "soft_locked" &&
    !input.roles.some((role) => ["owner", "finance_admin"].includes(role))
  ) {
    throw new Error("PERIOD_SOFT_LOCKED");
  }
  const posted = transitionEvent(event, "approved", "posted", input.actorId);
  return Object.freeze({
    ...posted,
    journalId: required(input.journalId, "Recognition journal ID"),
  });
}

export function reverseRevenueRecognitionEvent(
  event: RevenueRecognitionEvent,
  actorId: string,
  reversalJournalId: string,
): RevenueRecognitionEvent {
  const reversed = transitionEvent(event, "posted", "reversed", actorId);
  return Object.freeze({
    ...reversed,
    reversalJournalId: required(reversalJournalId, "Recognition reversal journal ID"),
  });
}

const unique = (values: readonly (string | undefined)[]) =>
  Object.freeze([...new Set(values.filter((value): value is string => Boolean(value)))].sort());

export function buildProjectRevenueAxes(input: {
  projectId: string;
  startsOn: string;
  endsOn: string;
  currency: string;
  movements: readonly ProjectRevenueAxisMovement[];
}): ProjectRevenueAxes {
  const startsOn = isoDate(input.startsOn, "Revenue axes start");
  const endsOn = isoDate(input.endsOn, "Revenue axes end");
  if (endsOn < startsOn) throw new Error("Revenue axes end cannot precede start");
  const reportCurrency = currency(input.currency);
  const movements = input.movements.filter(
    (movement) =>
      movement.projectId === input.projectId &&
      movement.effectiveOn >= startsOn &&
      movement.effectiveOn <= endsOn,
  );
  if (movements.some((movement) => currency(movement.currency) !== reportCurrency)) {
    throw new Error("Revenue axes cannot silently combine currencies");
  }
  const sum = (field: keyof ProjectRevenueAxisMovement) =>
    movements.reduce(
      (total, movement) => total + ((movement[field] as bigint | undefined) ?? 0n),
      0n,
    );
  return Object.freeze({
    projectId: required(input.projectId, "Revenue axes project ID"),
    startsOn,
    endsOn,
    currency: reportCurrency,
    recognizedNetMinor: sum("recognizedNetMinor"),
    invoicedNetMinor: sum("invoicedNetMinor"),
    collectedGrossMinor: sum("collectedGrossMinor"),
    collectedNetMinor: sum("collectedNetMinor"),
    deferredRevenueMinor: sum("deferredRevenueMinor"),
    contractAssetMinor: sum("contractAssetMinor"),
    recognitionEventIds: unique(movements.map((movement) => movement.recognitionEventId)),
    invoiceIds: unique(movements.map((movement) => movement.invoiceId)),
    reconciliationIds: unique(movements.map((movement) => movement.reconciliationId)),
    journalIds: unique(movements.map((movement) => movement.journalId)),
  });
}
