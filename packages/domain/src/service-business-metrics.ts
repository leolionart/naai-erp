export const SERVICE_BUSINESS_METRICS_FORMULA_VERSION = "service-business-metrics-v1" as const;

export type ServiceBusinessConfidenceCode =
  | "missing_client"
  | "missing_project"
  | "missing_contract_value"
  | "contract_over_recognized"
  | "missing_project_budget"
  | "missing_estimate_to_complete"
  | "zero_credit_revenue"
  | "zero_ar_balance"
  | "high_overdue_ar"
  | "high_client_revenue_concentration"
  | "high_client_ar_concentration";

export type ServiceBusinessConfidenceFlag = Readonly<{
  code: ServiceBusinessConfidenceCode;
  severity: "info" | "warning" | "critical";
  sourceIds: readonly string[];
  amountMinor?: bigint;
  ratioBps?: number;
}>;

export type ContractBacklogInput = Readonly<{
  id: string;
  clientId?: string;
  projectId?: string;
  status: "active" | "completed" | "cancelled";
  contractedValueMinor?: bigint;
  recognizedRevenueMinor: bigint;
}>;

export type ProjectDeliveryInput = Readonly<{
  projectId: string;
  budgetCostMinor?: bigint;
  actualCostMinor: bigint;
  estimateToCompleteMinor?: bigint;
}>;

export type ClientPerformanceInput = Readonly<{
  clientId?: string;
  recognizedRevenueMinor: bigint;
  accountsReceivableMinor: bigint;
  overdueAccountsReceivableMinor: bigint;
}>;

export type RevenueMixInput = Readonly<{
  sourceId: string;
  kind: "recurring" | "one_off";
  recognizedRevenueMinor: bigint;
}>;

export type ServiceBusinessMetricsInput = Readonly<{
  organizationId: string;
  startsOn: string;
  endsOn: string;
  asOfDate: string;
  currency: string;
  creditRevenueMinor: bigint;
  averageMonthlyRecognizedRevenueMinor: bigint;
  contracts: readonly ContractBacklogInput[];
  projects: readonly ProjectDeliveryInput[];
  clients: readonly ClientPerformanceInput[];
  revenueMix: readonly RevenueMixInput[];
  concentrationWarningBps?: number;
  overdueWarningBps?: number;
}>;

export type ServiceBusinessMetrics = Readonly<{
  organizationId: string;
  startsOn: string;
  endsOn: string;
  asOfDate: string;
  currency: string;
  formulaVersion: typeof SERVICE_BUSINESS_METRICS_FORMULA_VERSION;
  contractedValueMinor: bigint;
  remainingContractValueMinor: bigint;
  contractedBacklogMinor: bigint;
  backlogCoverageMonthsThousandths: bigint | null;
  accountsReceivableMinor: bigint;
  overdueAccountsReceivableMinor: bigint;
  dsoDaysThousandths: bigint | null;
  overdueArBps: number | null;
  projectBudgetMinor: bigint;
  projectActualCostMinor: bigint;
  projectEstimateToCompleteMinor: bigint;
  projectEstimateAtCompletionMinor: bigint;
  projectBudgetBurnBps: number | null;
  projectEacVarianceMinor: bigint;
  projectEacVarianceBps: number | null;
  topClientRevenueBps: number | null;
  topClientArBps: number | null;
  revenueConcentrationHhiBps: number | null;
  arConcentrationHhiBps: number | null;
  recurringRevenueMinor: bigint;
  oneOffRevenueMinor: bigint;
  recurringRevenueBps: number | null;
  confidenceFlags: readonly ServiceBusinessConfidenceFlag[];
}>;

const required = (value: string, label: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};
const isoDate = (value: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be an ISO date`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value)
    throw new Error(`${label} must be an ISO date`);
  return value;
};
const daysInclusive = (start: string, end: string) =>
  Math.floor(
    (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000,
  ) + 1;
const ratioBps = (numerator: bigint, denominator: bigint) =>
  denominator === 0n ? null : Number((numerator * 10_000n) / denominator);
const unique = (values: readonly string[]) => Object.freeze([...new Set(values)].sort());
const nonNegative = (value: bigint, label: string) => {
  if (value < 0n) throw new Error(`${label} cannot be negative`);
};
const validThreshold = (value: number | undefined, fallback: number, label: string) => {
  const normalized = value ?? fallback;
  if (!Number.isInteger(normalized) || normalized < 0 || normalized > 10_000)
    throw new Error(`${label} must be integer basis points from 0 to 10000`);
  return normalized;
};

function hhiBps(values: readonly bigint[], total: bigint) {
  if (total === 0n) return null;
  return Number(values.reduce((sum, value) => sum + value * value * 10_000n, 0n) / (total * total));
}

export function buildServiceBusinessMetrics(
  input: ServiceBusinessMetricsInput,
): ServiceBusinessMetrics {
  const organizationId = required(input.organizationId, "Organization ID");
  const startsOn = isoDate(input.startsOn, "Metric start date");
  const endsOn = isoDate(input.endsOn, "Metric end date");
  const asOfDate = isoDate(input.asOfDate, "Metric as-of date");
  if (startsOn > endsOn || endsOn > asOfDate) throw new Error("Metric period is invalid");
  const currency = required(input.currency, "Currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be ISO-4217");
  nonNegative(input.creditRevenueMinor, "Credit revenue");
  nonNegative(input.averageMonthlyRecognizedRevenueMinor, "Average monthly revenue");
  const concentrationWarningBps = validThreshold(
    input.concentrationWarningBps,
    5_000,
    "Concentration warning",
  );
  const overdueWarningBps = validThreshold(input.overdueWarningBps, 2_000, "Overdue warning");
  const flags: ServiceBusinessConfidenceFlag[] = [];
  const flag = (
    code: ServiceBusinessConfidenceCode,
    severity: ServiceBusinessConfidenceFlag["severity"],
    sourceIds: readonly string[],
    details: Pick<ServiceBusinessConfidenceFlag, "amountMinor" | "ratioBps"> = {},
  ) => flags.push(Object.freeze({ code, severity, sourceIds: unique(sourceIds), ...details }));

  let contractedValueMinor = 0n;
  let remainingContractValueMinor = 0n;
  let contractedBacklogMinor = 0n;
  for (const contract of input.contracts) {
    const id = required(contract.id, "Contract ID");
    nonNegative(contract.recognizedRevenueMinor, "Contract recognized revenue");
    if (!contract.clientId?.trim()) flag("missing_client", "critical", [id]);
    if (!contract.projectId?.trim()) flag("missing_project", "warning", [id]);
    if (contract.contractedValueMinor === undefined) {
      flag("missing_contract_value", "critical", [id]);
      continue;
    }
    nonNegative(contract.contractedValueMinor, "Contracted value");
    contractedValueMinor += contract.contractedValueMinor;
    const rawRemaining = contract.contractedValueMinor - contract.recognizedRevenueMinor;
    if (rawRemaining < 0n) {
      flag("contract_over_recognized", "critical", [id], { amountMinor: -rawRemaining });
      continue;
    }
    if (contract.status !== "cancelled") remainingContractValueMinor += rawRemaining;
    if (contract.status === "active") contractedBacklogMinor += rawRemaining;
  }

  let projectBudgetMinor = 0n;
  let projectActualCostMinor = 0n;
  let projectEstimateToCompleteMinor = 0n;
  for (const project of input.projects) {
    const id = required(project.projectId, "Project ID");
    nonNegative(project.actualCostMinor, "Project actual cost");
    projectActualCostMinor += project.actualCostMinor;
    if (project.budgetCostMinor === undefined) flag("missing_project_budget", "critical", [id]);
    else {
      nonNegative(project.budgetCostMinor, "Project budget");
      projectBudgetMinor += project.budgetCostMinor;
    }
    if (project.estimateToCompleteMinor === undefined)
      flag("missing_estimate_to_complete", "warning", [id]);
    else {
      nonNegative(project.estimateToCompleteMinor, "Estimate to complete");
      projectEstimateToCompleteMinor += project.estimateToCompleteMinor;
    }
  }
  const projectEstimateAtCompletionMinor = projectActualCostMinor + projectEstimateToCompleteMinor;
  const projectEacVarianceMinor = projectBudgetMinor - projectEstimateAtCompletionMinor;

  const knownClients = new Map<string, { revenue: bigint; ar: bigint }>();
  let accountsReceivableMinor = 0n;
  let overdueAccountsReceivableMinor = 0n;
  for (const [index, client] of input.clients.entries()) {
    nonNegative(client.recognizedRevenueMinor, "Client revenue");
    nonNegative(client.accountsReceivableMinor, "Client accounts receivable");
    nonNegative(client.overdueAccountsReceivableMinor, "Client overdue accounts receivable");
    if (client.overdueAccountsReceivableMinor > client.accountsReceivableMinor)
      throw new Error("Client overdue accounts receivable cannot exceed accounts receivable");
    accountsReceivableMinor += client.accountsReceivableMinor;
    overdueAccountsReceivableMinor += client.overdueAccountsReceivableMinor;
    const id = client.clientId?.trim();
    if (!id) {
      flag("missing_client", "critical", [`client-row-${index + 1}`]);
      continue;
    }
    const current = knownClients.get(id) ?? { revenue: 0n, ar: 0n };
    current.revenue += client.recognizedRevenueMinor;
    current.ar += client.accountsReceivableMinor;
    knownClients.set(id, current);
  }
  const clientRevenue = [...knownClients.values()].map((value) => value.revenue);
  const clientAr = [...knownClients.values()].map((value) => value.ar);
  const totalKnownRevenue = clientRevenue.reduce((sum, value) => sum + value, 0n);
  const totalKnownAr = clientAr.reduce((sum, value) => sum + value, 0n);
  const topClientRevenueBps = ratioBps(
    clientRevenue.reduce((max, value) => (value > max ? value : max), 0n),
    totalKnownRevenue,
  );
  const topClientArBps = ratioBps(
    clientAr.reduce((max, value) => (value > max ? value : max), 0n),
    totalKnownAr,
  );
  const topRevenueMinor = clientRevenue.reduce((max, value) => (value > max ? value : max), 0n);
  const topArMinor = clientAr.reduce((max, value) => (value > max ? value : max), 0n);
  const topRevenueClientIds = [...knownClients.entries()]
    .filter(([, value]) => value.revenue === topRevenueMinor)
    .map(([id]) => id);
  const topArClientIds = [...knownClients.entries()]
    .filter(([, value]) => value.ar === topArMinor)
    .map(([id]) => id);
  const overdueArBps = ratioBps(overdueAccountsReceivableMinor, accountsReceivableMinor);
  if (input.creditRevenueMinor === 0n) flag("zero_credit_revenue", "info", []);
  if (accountsReceivableMinor === 0n) flag("zero_ar_balance", "info", []);
  if (overdueArBps !== null && overdueArBps >= overdueWarningBps)
    flag("high_overdue_ar", "warning", [], {
      amountMinor: overdueAccountsReceivableMinor,
      ratioBps: overdueArBps,
    });
  if (topClientRevenueBps !== null && topClientRevenueBps >= concentrationWarningBps)
    flag("high_client_revenue_concentration", "warning", topRevenueClientIds, {
      ratioBps: topClientRevenueBps,
    });
  if (topClientArBps !== null && topClientArBps >= concentrationWarningBps)
    flag("high_client_ar_concentration", "warning", topArClientIds, {
      ratioBps: topClientArBps,
    });

  let recurringRevenueMinor = 0n;
  let oneOffRevenueMinor = 0n;
  for (const item of input.revenueMix) {
    required(item.sourceId, "Revenue source ID");
    nonNegative(item.recognizedRevenueMinor, "Revenue mix amount");
    if (item.kind === "recurring") recurringRevenueMinor += item.recognizedRevenueMinor;
    else oneOffRevenueMinor += item.recognizedRevenueMinor;
  }
  const revenueMixTotal = recurringRevenueMinor + oneOffRevenueMinor;
  const periodDays = BigInt(daysInclusive(startsOn, endsOn));

  return Object.freeze({
    organizationId,
    startsOn,
    endsOn,
    asOfDate,
    currency,
    formulaVersion: SERVICE_BUSINESS_METRICS_FORMULA_VERSION,
    contractedValueMinor,
    remainingContractValueMinor,
    contractedBacklogMinor,
    backlogCoverageMonthsThousandths:
      input.averageMonthlyRecognizedRevenueMinor === 0n
        ? null
        : (contractedBacklogMinor * 1_000n) / input.averageMonthlyRecognizedRevenueMinor,
    accountsReceivableMinor,
    overdueAccountsReceivableMinor,
    dsoDaysThousandths:
      input.creditRevenueMinor === 0n
        ? null
        : (accountsReceivableMinor * periodDays * 1_000n) / input.creditRevenueMinor,
    overdueArBps,
    projectBudgetMinor,
    projectActualCostMinor,
    projectEstimateToCompleteMinor,
    projectEstimateAtCompletionMinor,
    projectBudgetBurnBps: ratioBps(projectActualCostMinor, projectBudgetMinor),
    projectEacVarianceMinor,
    projectEacVarianceBps: ratioBps(projectEacVarianceMinor, projectBudgetMinor),
    topClientRevenueBps,
    topClientArBps,
    revenueConcentrationHhiBps: hhiBps(clientRevenue, totalKnownRevenue),
    arConcentrationHhiBps: hhiBps(clientAr, totalKnownAr),
    recurringRevenueMinor,
    oneOffRevenueMinor,
    recurringRevenueBps: ratioBps(recurringRevenueMinor, revenueMixTotal),
    confidenceFlags: Object.freeze(flags),
  });
}
