import { currencyCode, type CurrencyCode } from "./organization-setup.js";
import { organizationId, type OrganizationId } from "./organization.js";

export const PARTY_ROLES = ["client", "supplier", "freelancer", "employee"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];
export type PartyStatus = "active" | "inactive" | "merged";

export type Party = Readonly<{
  organizationId: OrganizationId;
  id: string;
  displayName: string;
  taxId?: string;
  roles: readonly PartyRole[];
  status: PartyStatus;
  mergedIntoPartyId?: string;
}>;

export const PROJECT_STATES = ["planned", "active", "on_hold", "completed", "closed"] as const;
export type ProjectState = (typeof PROJECT_STATES)[number];
export type ContractType = "fixed_fee" | "time_and_materials" | "retainer" | "internal";

export type Project = Readonly<{
  organizationId: OrganizationId;
  id: string;
  code: string;
  name: string;
  clientPartyId: string;
  ownerUserId: string;
  contractType: ContractType;
  currency: CurrencyCode;
  budgetMinor: bigint;
  startsOn: string;
  endsOn?: string;
  state: ProjectState;
}>;

export type Contract = Readonly<{
  organizationId: OrganizationId;
  id: string;
  projectId: string;
  reference: string;
  signedOn?: string;
  valueMinor: bigint;
  currency: CurrencyCode;
}>;

export type Milestone = Readonly<{
  organizationId: OrganizationId;
  id: string;
  contractId: string;
  name: string;
  dueOn?: string;
  amountMinor: bigint;
}>;

function text(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function date(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`${label} must be an ISO date`);
  }
  return value;
}

export function createParty(input: {
  organizationId: string;
  id: string;
  displayName: string;
  taxId?: string;
  roles: readonly PartyRole[];
}): Party {
  const roles = [...new Set(input.roles)];
  if (!roles.length) throw new Error("Party requires at least one explicit role");
  return {
    organizationId: organizationId(input.organizationId),
    id: text(input.id, "Party ID"),
    displayName: text(input.displayName, "Party name"),
    ...(input.taxId?.trim() ? { taxId: input.taxId.trim() } : {}),
    roles,
    status: "active",
  };
}

export function mergeParty(source: Party, target: Party): Party {
  if (source.organizationId !== target.organizationId)
    throw new Error("Parties must belong to the same organization");
  if (source.id === target.id) throw new Error("Party cannot merge into itself");
  if (source.status === "merged") throw new Error("Party is already merged");
  return { ...source, status: "merged", mergedIntoPartyId: target.id };
}

export function createProject(input: {
  organizationId: string;
  id: string;
  code: string;
  name: string;
  clientPartyId: string;
  ownerUserId: string;
  contractType: ContractType;
  currency: string;
  budgetMinor: bigint;
  startsOn: string;
  endsOn?: string;
}): Project {
  const startsOn = date(input.startsOn, "Project start date");
  const endsOn = input.endsOn ? date(input.endsOn, "Project end date") : undefined;
  if (endsOn && endsOn < startsOn) throw new Error("Project end date cannot precede start date");
  if (input.budgetMinor < 0n) throw new Error("Project budget cannot be negative");
  return {
    organizationId: organizationId(input.organizationId),
    id: text(input.id, "Project ID"),
    code: text(input.code, "Project code"),
    name: text(input.name, "Project name"),
    clientPartyId: text(input.clientPartyId, "Client party ID"),
    ownerUserId: text(input.ownerUserId, "Project owner"),
    contractType: input.contractType,
    currency: currencyCode(input.currency),
    budgetMinor: input.budgetMinor,
    startsOn,
    ...(endsOn ? { endsOn } : {}),
    state: "planned",
  };
}

export function transitionProject(
  project: Project,
  next: ProjectState,
  approvedReopen = false,
): Project {
  const allowed: Record<ProjectState, readonly ProjectState[]> = {
    planned: ["active", "closed"],
    active: ["on_hold", "completed", "closed"],
    on_hold: ["active", "closed"],
    completed: ["active", "closed"],
    closed: approvedReopen ? ["active"] : [],
  };
  if (!allowed[project.state].includes(next))
    throw new Error(`Invalid project transition: ${project.state} -> ${next}`);
  return { ...project, state: next };
}

export function assertProjectAcceptsAllocation(project: Project): void {
  if (project.state === "closed") throw new Error("Closed project rejects new allocations");
}

export function createContract(input: {
  organizationId: string;
  id: string;
  projectId: string;
  reference: string;
  signedOn?: string;
  valueMinor: bigint;
  currency: string;
}): Contract {
  if (input.valueMinor < 0n) throw new Error("Contract value cannot be negative");
  return {
    organizationId: organizationId(input.organizationId),
    id: text(input.id, "Contract ID"),
    projectId: text(input.projectId, "Project ID"),
    reference: text(input.reference, "Contract reference"),
    ...(input.signedOn ? { signedOn: date(input.signedOn, "Contract signed date") } : {}),
    valueMinor: input.valueMinor,
    currency: currencyCode(input.currency),
  };
}

export function createMilestone(input: {
  organizationId: string;
  id: string;
  contractId: string;
  name: string;
  dueOn?: string;
  amountMinor: bigint;
}): Milestone {
  if (input.amountMinor < 0n) throw new Error("Milestone amount cannot be negative");
  return {
    organizationId: organizationId(input.organizationId),
    id: text(input.id, "Milestone ID"),
    contractId: text(input.contractId, "Contract ID"),
    name: text(input.name, "Milestone name"),
    ...(input.dueOn ? { dueOn: date(input.dueOn, "Milestone due date") } : {}),
    amountMinor: input.amountMinor,
  };
}
