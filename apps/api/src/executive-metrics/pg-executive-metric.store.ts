import { Inject, Injectable } from "@nestjs/common";
import { buildExecutiveMetrics } from "@naai-erp/domain";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import {
  FINANCIAL_STATEMENT_STORE,
  type FinancialStatementStore,
} from "../financial-statements/financial-statement.types.js";
import {
  canSelfApprove,
  resolveOrganizationWorkflowPolicy,
} from "../workflow-policy/organization-workflow-policy.service.js";
import type {
  ExecutiveMetricContext,
  ExecutiveMetricQuery,
  PolicyInput,
  RoiDefinitionInput,
  RoiFactInput,
} from "./executive-metric.types.js";

const jsonMoney = (v: unknown): unknown =>
  typeof v === "bigint"
    ? v.toString()
    : Array.isArray(v)
      ? v.map(jsonMoney)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonMoney(x)]))
        : v;
@Injectable()
export class PgExecutiveMetricStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  constructor(@Inject(FINANCIAL_STATEMENT_STORE) private readonly fs: FinancialStatementStore) {}
  async listPolicies(c: ExecutiveMetricContext) {
    return {
      items: (
        await this.pool.query(
          `select p.*,count(m.*)::text mapping_count from executive_metric_policy_versions p left join executive_metric_semantic_mappings m on m.organization_id=p.organization_id and m.policy_id=p.id and m.policy_version=p.version where p.organization_id=$1 group by p.organization_id,p.id,p.version order by p.effective_from desc,p.version desc`,
          [c.organizationId],
        )
      ).rows,
    };
  }
  async getPolicy(c: ExecutiveMetricContext, id: string, version?: number) {
    const r = await this.pool.query(
      `select p.*,coalesce(json_agg(m order by m.semantic,m.account_code) filter(where m.account_code is not null),'[]') mappings from executive_metric_policy_versions p left join executive_metric_semantic_mappings m on m.organization_id=p.organization_id and m.policy_id=p.id and m.policy_version=p.version where p.organization_id=$1 and p.id=$2 and ($3::int is null or p.version=$3) group by p.organization_id,p.id,p.version order by p.version desc limit 1`,
      [c.organizationId, id, version ?? null],
    );
    if (!r.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return r.rows[0];
  }
  private async idem<T>(
    c: ExecutiveMetricContext,
    operation: string,
    key: string,
    input: unknown,
    fn: (x: pg.PoolClient) => Promise<T>,
  ): Promise<T & { idempotencyReplayed: boolean }> {
    const k = `${operation}:${key}`,
      h = createHash("sha256").update(JSON.stringify(input)).digest("hex"),
      x = await this.pool.connect();
    try {
      await x.query("begin");
      await x.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${c.organizationId}:${k}`,
      ]);
      const old = await x.query<{ request_hash: string; response_body: T }>(
        `select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update`,
        [c.organizationId, k],
      );
      if (old.rows[0]) {
        if (old.rows[0].request_hash !== h) throw new Error("IDEMPOTENCY_CONFLICT");
        await x.query("rollback");
        return { ...old.rows[0].response_body, idempotencyReplayed: true };
      }
      const out = await fn(x);
      await x.query(
        `insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body)values($1,$2,$3,$4,$5)`,
        [c.organizationId, k, operation, h, out],
      );
      await x.query("commit");
      return { ...out, idempotencyReplayed: false };
    } catch (e) {
      await x.query("rollback");
      throw e;
    } finally {
      x.release();
    }
  }
  createPolicy(c: ExecutiveMetricContext, i: PolicyInput, k: string) {
    return this.idem(c, "executive-metric-policy:create", k, i, async (x) => {
      const id = i.id ?? randomUUID(),
        version = Number(
          (
            await x.query(
              `select coalesce(max(version),0)+1 version from executive_metric_policy_versions where organization_id=$1 and id=$2`,
              [c.organizationId, id],
            )
          ).rows[0]?.version ?? 1,
        );
      await x.query(
        `insert into executive_metric_policy_versions(organization_id,id,version,state,effective_from,effective_to,formula_version,formula_policy,change_reason,created_by)values($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9)`,
        [
          c.organizationId,
          id,
          version,
          i.effectiveFrom,
          i.effectiveTo ?? null,
          i.formulaVersion,
          i.formulaPolicy,
          i.changeReason.trim(),
          c.actorId,
        ],
      );
      for (const m of i.mappings)
        await x.query(
          `insert into executive_metric_semantic_mappings(organization_id,policy_id,policy_version,semantic,account_code,sign,notes)values($1,$2,$3,$4,$5,$6,$7)`,
          [c.organizationId, id, version, m.semantic, m.accountCode, m.sign ?? 1, m.notes ?? null],
        );
      return {
        id,
        version,
        state: "draft",
        mappingCount: i.mappings.length,
        nextActions: ["approve"],
      };
    });
  }
  approvePolicy(c: ExecutiveMetricContext, id: string, v: number, r: string, k: string) {
    return this.idem(
      c,
      `executive-metric-policy:approve:${id}:${v}`,
      k,
      { id, v, r },
      async (x) => {
        const workflow = await resolveOrganizationWorkflowPolicy(c.organizationId, x);
        const draft = await x.query<{ created_by: string }>(
          `select created_by from executive_metric_policy_versions where organization_id=$1 and id=$2 and version=$3 and state='draft' for update`,
          [c.organizationId, id, v],
        );
        const solopreneurSelfApproval = canSelfApprove({
          policy: workflow,
          roles: c.roles,
        });
        if (draft.rows[0]?.created_by === c.actorId && !solopreneurSelfApproval)
          throw new Error("MAKER_CHECKER_VIOLATION");
        const u = await x.query(
          `update executive_metric_policy_versions set state='approved',approved_by=$4,approved_at=now(),updated_at=now(),change_reason=change_reason||E'\nApproval: '||$5 where organization_id=$1 and id=$2 and version=$3 and state='draft' and (created_by<>$4 or $6::boolean) returning id,version,state,approved_at`,
          [c.organizationId, id, v, c.actorId, r.trim(), solopreneurSelfApproval],
        );
        if (!u.rows[0]) throw new Error("INVALID_STATE_TRANSITION");
        return u.rows[0];
      },
    );
  }
  async listDefinitions(c: ExecutiveMetricContext) {
    return {
      items: (
        await this.pool.query(
          `select * from roi_definition_versions where organization_id=$1 order by purpose,name,version desc`,
          [c.organizationId],
        )
      ).rows,
    };
  }
  async getDefinition(c: ExecutiveMetricContext, id: string, v?: number) {
    const r = await this.pool.query(
      `select * from roi_definition_versions where organization_id=$1 and id=$2 and ($3::int is null or version=$3) order by version desc limit 1`,
      [c.organizationId, id, v ?? null],
    );
    if (!r.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    return r.rows[0];
  }
  createDefinition(c: ExecutiveMetricContext, i: RoiDefinitionInput, k: string) {
    return this.idem(c, "roi-definition:create", k, i, async (x) => {
      const id = i.id ?? randomUUID(),
        version = Number(
          (
            await x.query(
              `select coalesce(max(version),0)+1 version from roi_definition_versions where organization_id=$1 and id=$2`,
              [c.organizationId, id],
            )
          ).rows[0]?.version ?? 1,
        );
      await x.query(
        `insert into roi_definition_versions(organization_id,id,version,purpose,name,state,effective_from,effective_to,formula_version,included_cost_policy,change_reason,created_by)values($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10,$11)`,
        [
          c.organizationId,
          id,
          version,
          i.purpose,
          i.name.trim(),
          i.effectiveFrom,
          i.effectiveTo ?? null,
          i.formulaVersion,
          i.includedCostPolicy,
          i.changeReason.trim(),
          c.actorId,
        ],
      );
      return { id, version, state: "draft", purpose: i.purpose, nextActions: ["approve"] };
    });
  }
  approveDefinition(c: ExecutiveMetricContext, id: string, v: number, r: string, k: string) {
    return this.idem(c, `roi-definition:approve:${id}:${v}`, k, { id, v, r }, async (x) => {
      const draft = await x.query<{ created_by: string }>(
        `select created_by from roi_definition_versions where organization_id=$1 and id=$2 and version=$3 and state='draft' for update`,
        [c.organizationId, id, v],
      );
      const policy = await resolveOrganizationWorkflowPolicy(c.organizationId, x);
      const selfApproval = canSelfApprove({ policy, roles: c.roles });
      if (draft.rows[0]?.created_by === c.actorId && !selfApproval)
        throw new Error("MAKER_CHECKER_VIOLATION");
      const u = await x.query(
        `update roi_definition_versions set state='approved',approved_by=$4,approved_at=now(),updated_at=now(),change_reason=change_reason||E'\nApproval: '||$5 where organization_id=$1 and id=$2 and version=$3 and state='draft' and (created_by<>$4 or $6::boolean) returning id,version,state,approved_at`,
        [c.organizationId, id, v, c.actorId, r.trim(), selfApproval],
      );
      if (!u.rows[0]) throw new Error("INVALID_STATE_TRANSITION");
      return u.rows[0];
    });
  }
  async listFacts(c: ExecutiveMetricContext, d?: string, s?: string) {
    return {
      items: (
        await this.pool.query(
          `select *,amount_minor::text from roi_input_facts where organization_id=$1 and ($2::text is null or definition_id=$2) and ($3::roi_input_review_state is null or review_state=$3) order by period_starts_on desc,id`,
          [c.organizationId, d ?? null, s ?? null],
        )
      ).rows,
    };
  }
  createFact(c: ExecutiveMetricContext, i: RoiFactInput, k: string) {
    return this.idem(c, "roi-input-fact:create", k, i, async (x) => {
      const id = i.id ?? randomUUID();
      await x.query(
        `insert into roi_input_facts(organization_id,id,definition_id,definition_version,kind,period_starts_on,period_ends_on,dimensions,amount_minor,currency,source_type,source_id,review_state)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending')`,
        [
          c.organizationId,
          id,
          i.definitionId,
          i.definitionVersion,
          i.kind,
          i.periodStartsOn,
          i.periodEndsOn,
          i.dimensions ?? {},
          i.amountMinor,
          i.currency.toUpperCase(),
          i.sourceType.trim(),
          i.sourceId.trim(),
        ],
      );
      return { id, reviewState: "pending", nextActions: ["review"] };
    });
  }
  reviewFact(
    c: ExecutiveMetricContext,
    id: string,
    s: "reviewed" | "rejected",
    r: string,
    k: string,
  ) {
    return this.idem(c, `roi-input-fact:review:${id}`, k, { id, s, r }, async (x) => {
      const u = await x.query(
        `update roi_input_facts set review_state=$3,reviewed_by=$4,reviewed_at=now(),review_reason=$5,updated_at=now() where organization_id=$1 and id=$2 and review_state='pending' returning id,review_state,reviewed_at`,
        [c.organizationId, id, s, c.actorId, r.trim()],
      );
      if (!u.rows[0]) throw new Error("INVALID_STATE_TRANSITION");
      return u.rows[0];
    });
  }
  async report(c: ExecutiveMetricContext, q: ExecutiveMetricQuery) {
    const fq = {
      startsOn: q.startsOn,
      endsOn: q.endsOn,
      asOfInstant: q.asOfInstant,
      framework: q.framework,
      basis: "accrual" as const,
      dimensions: q.dimensions,
    };
    const openingFq = {
      endsOn: fq.endsOn,
      asOfInstant: fq.asOfInstant,
      framework: fq.framework,
      basis: fq.basis,
      dimensions: fq.dimensions,
    };
    const [pnl, closing, opening, policy] = await Promise.all([
      this.fs.report(c, "profit_and_loss", fq),
      this.fs.report(c, "balance_sheet", fq),
      this.fs.report(c, "balance_sheet", {
        ...openingFq,
        endsOn: new Date(new Date(`${q.startsOn}T00:00:00Z`).valueOf() - 86400000)
          .toISOString()
          .slice(0, 10),
      }),
      this.pool.query(
        `select * from executive_metric_policy_versions where organization_id=$1 and state='approved' and effective_from<=$2 and(effective_to is null or effective_to>=$3) order by effective_from desc,version desc limit 1`,
        [c.organizationId, q.startsOn, q.endsOn],
      ),
    ]);
    if (!policy.rows[0]) throw new Error("EXECUTIVE_METRIC_POLICY_NOT_FOUND");
    const policyRow = policy.rows[0] as {
      id: string;
      version: number;
      formula_policy: { averageBurnMonths: number };
    };
    const monthPeriods: { startsOn: string; endsOn: string }[] = [];
    const requestedEnd = new Date(`${q.endsOn}T00:00:00.000Z`);
    let cursor =
      requestedEnd.getUTCDate() ===
      new Date(
        Date.UTC(requestedEnd.getUTCFullYear(), requestedEnd.getUTCMonth() + 1, 0),
      ).getUTCDate()
        ? requestedEnd
        : new Date(Date.UTC(requestedEnd.getUTCFullYear(), requestedEnd.getUTCMonth(), 0));
    for (let index = 0; index < policyRow.formula_policy.averageBurnMonths; index += 1) {
      const endsOn = cursor.toISOString().slice(0, 10);
      const startsOn = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1))
        .toISOString()
        .slice(0, 10);
      monthPeriods.unshift({ startsOn, endsOn });
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 0));
    }
    const monthlyCashFlows = await Promise.all(
      monthPeriods.map((period) =>
        this.fs
          .report(c, "cash_flow", { ...fq, ...period })
          .then((value) => value as Record<string, unknown>),
      ),
    );
    const P = pnl as Record<string, unknown>,
      B = closing as Record<string, unknown>,
      O = opening as Record<string, unknown>;
    const sem = await this.pool.query<{ semantic: string; amount: string; source_ids: string[] }>(
      `select m.semantic,sum((case when a.root_type in('liability','equity','revenue')then coalesce(l.credit_minor,0)-coalesce(l.debit_minor,0) else coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0) end)*m.sign)::text amount,array_agg(distinct j.id) source_ids from executive_metric_semantic_mappings m join accounts a on a.organization_id=m.organization_id and a.code=m.account_code join journal_lines l on l.organization_id=a.organization_id and l.account_code=a.code join journal_entries j on j.organization_id=l.organization_id and j.id=l.journal_id where m.organization_id=$1 and m.policy_id=$2 and m.policy_version=$3 and j.state in('posted','reversed') and j.posted_at<=$4::timestamptz and j.journal_date<=$5::date and l.dimensions@>$6::jsonb group by m.semantic`,
      [
        c.organizationId,
        policyRow.id,
        policyRow.version,
        q.asOfInstant,
        q.endsOn,
        JSON.stringify(q.dimensions),
      ],
    );
    const amounts = Object.fromEntries(sem.rows.map((x) => [x.semantic, BigInt(x.amount ?? "0")]));
    const periodSem = await this.pool.query<{ semantic: string; amount: string }>(
      `select m.semantic,sum((case when a.root_type in('liability','equity','revenue')then coalesce(l.credit_minor,0)-coalesce(l.debit_minor,0) else coalesce(l.debit_minor,0)-coalesce(l.credit_minor,0) end)*m.sign)::text amount from executive_metric_semantic_mappings m join accounts a on a.organization_id=m.organization_id and a.code=m.account_code join journal_lines l on l.organization_id=a.organization_id and l.account_code=a.code join journal_entries j on j.organization_id=l.organization_id and j.id=l.journal_id where m.organization_id=$1 and m.policy_id=$2 and m.policy_version=$3 and j.state in('posted','reversed') and j.posted_at<=$4::timestamptz and j.journal_date between $5::date and $6::date and l.dimensions@>$7::jsonb group by m.semantic`,
      [
        c.organizationId,
        policyRow.id,
        policyRow.version,
        q.asOfInstant,
        q.startsOn,
        q.endsOn,
        JSON.stringify(q.dimensions),
      ],
    );
    const movements = Object.fromEntries(
      periodSem.rows.map((x) => [x.semantic, BigInt(x.amount ?? "0")]),
    );
    const rf = await this.pool.query<{
      id: string;
      definition_id: string;
      definition_version: number;
      purpose: "project" | "marketing" | "custom";
      name: string;
      kind: string;
      amount: string;
      source_ids: string[];
    }>(
      `select d.id,d.id definition_id,d.version definition_version,d.purpose,d.name,f.kind,sum(f.amount_minor)::text amount,array_agg(distinct f.source_type||':'||f.source_id) source_ids from roi_definition_versions d join roi_input_facts f on f.organization_id=d.organization_id and f.definition_id=d.id and f.definition_version=d.version where d.organization_id=$1 and d.state='approved' and f.review_state='reviewed' and f.period_starts_on>=$2 and f.period_ends_on<=$3 and f.period_starts_on>=d.effective_from and(d.effective_to is null or f.period_ends_on<=d.effective_to) and f.currency=$4 and f.dimensions@>$5::jsonb group by d.id,d.version,d.purpose,d.name,f.kind`,
      [c.organizationId, q.startsOn, q.endsOn, String(P.currency), JSON.stringify(q.dimensions)],
    );
    type RoiGroup = {
      id: string;
      purpose: "project" | "marketing" | "custom";
      label: string;
      benefitMinor: bigint;
      includedCostMinor: bigint;
      policyVersionId: string;
      sourceIds: string[];
    };
    const groups = new Map<string, RoiGroup>();
    for (const x of rf.rows) {
      const groupId = `${x.id}:${x.definition_version}`;
      const g = groups.get(groupId) ?? {
        id: groupId,
        purpose: x.purpose,
        label: x.name,
        benefitMinor: 0n,
        includedCostMinor: 0n,
        policyVersionId: `${x.definition_id}:${x.definition_version}`,
        sourceIds: [],
      };
      if (x.kind === "benefit") g.benefitMinor = BigInt(x.amount);
      else g.includedCostMinor = BigInt(x.amount);
      g.sourceIds.push(...x.source_ids);
      groups.set(groupId, g);
    }
    const ledgerCutoff = P.ledgerCutoff as {
      sourceFingerprint: string;
      sourceIds?: readonly string[];
    };
    const statementSourceIds = (statement: Record<string, unknown>) =>
      [
        ...((statement.rows as { sourceIds?: readonly string[] }[] | undefined) ?? []),
        ...((statement.assetRows as { sourceIds?: readonly string[] }[] | undefined) ?? []),
        ...((statement.liabilityRows as { sourceIds?: readonly string[] }[] | undefined) ?? []),
        ...((statement.equityRows as { sourceIds?: readonly string[] }[] | undefined) ?? []),
        ...((statement.earningsRows as { sourceIds?: readonly string[] }[] | undefined) ?? []),
        ...((statement.movements as { sourceIds?: readonly string[] }[] | undefined) ?? []),
      ].flatMap((row) => row.sourceIds ?? []);
    const sources = [
      ...new Set([
        ...(ledgerCutoff.sourceIds ?? []),
        ...statementSourceIds(P),
        ...statementSourceIds(B),
        ...statementSourceIds(O),
        ...monthlyCashFlows.flatMap(statementSourceIds),
        ...sem.rows.flatMap((x) => x.source_ids),
        ...rf.rows.flatMap((x) => x.source_ids),
      ]),
    ].sort();
    const componentFingerprints = [P, B, O, ...monthlyCashFlows]
      .map((statement) =>
        String(
          (statement.ledgerCutoff as { sourceFingerprint?: string } | undefined)
            ?.sourceFingerprint ?? "",
        ),
      )
      .filter(Boolean);
    const sourceFingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          organizationId: c.organizationId,
          policyVersionId: `${policyRow.id}:${policyRow.version}`,
          period: { startsOn: q.startsOn, endsOn: q.endsOn, asOfInstant: q.asOfInstant },
          dimensions: Object.fromEntries(
            Object.entries(q.dimensions).sort(([left], [right]) => left.localeCompare(right)),
          ),
          componentFingerprints,
          sourceIds: sources,
        }),
      )
      .digest("hex");
    return jsonMoney({
      schemaVersion: 1,
      ...buildExecutiveMetrics({
        organizationId: c.organizationId,
        policyVersionId: `${policyRow.id}:${policyRow.version}`,
        currency: String(P.currency),
        period: { startsOn: q.startsOn, endsOn: q.endsOn, asOfDate: q.endsOn },
        dimensions: q.dimensions,
        sourceBoundary: {
          ledgerCutoffFingerprint: sourceFingerprint,
          sourceIds: sources.length ? sources : [`ledger:${sourceFingerprint}`],
        },
        revenueMinor: BigInt(String(P.revenueMinor)),
        grossProfitMinor: BigInt(String(P.grossProfitMinor)),
        operatingProfitMinor: BigInt(String(P.operatingProfitMinor)),
        netProfitMinor: BigInt(String(P.netProfitMinor)),
        openingEquityMinor: BigInt(String(O.totalEquityMinor)),
        closingEquityMinor: BigInt(String(B.totalEquityMinor)),
        contributionsMinor: movements.contributed_capital ?? 0n,
        withdrawalsMinor: movements.owner_withdrawal ?? 0n,
        reviewedEquityAdjustmentsMinor: movements.reviewed_equity_adjustment ?? 0n,
        openingAssetsMinor: BigInt(String(O.assetsMinor)),
        closingAssetsMinor: BigInt(String(B.assetsMinor)),
        retainedEarningsMinor: amounts.retained_earnings ?? 0n,
        unclosedEarningsMinor: BigInt(String(B.unclosedEarningsMinor ?? "0")),
        contributedCapitalMinor: amounts.contributed_capital ?? 0n,
        ownerLoansMinor: amounts.owner_loan ?? 0n,
        unrestrictedCashMinor: amounts.unrestricted_cash ?? 0n,
        restrictedCashMinor: amounts.restricted_cash ?? 0n,
        reviewedOperatingNetCashFlowMinor: monthlyCashFlows.every(
          (cashFlow) => cashFlow.status === "ready",
        )
          ? monthlyCashFlows.map((cashFlow) => BigInt(String(cashFlow.operatingCashFlowMinor)))
          : [],
        roi: [...groups.values()],
      }),
    });
  }
}
