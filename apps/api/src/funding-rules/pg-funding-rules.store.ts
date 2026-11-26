import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import type {
  FundingInputContract,
  FundingRuleContract,
  OrganizationFundingDefaultContract,
} from "@naai-erp/contracts";
import type {
  CreateFundingRuleInput,
  FundingRulesContext,
  FundingRulesStore,
  UpdateFundingRuleInput,
} from "./funding-rules.types.js";

type DefaultRow = {
  default_funding_type: FundingInputContract["type"];
  default_financial_account_id: string | null;
  version: string;
  updated_at: Date;
};

type RuleRow = {
  id: string;
  name: string;
  priority: number;
  is_active: boolean;
  match_external_system: string | null;
  match_supplier_tax_id: string | null;
  match_category_code: string | null;
  match_keyword: string | null;
  match_min_amount_minor: string | null;
  match_max_amount_minor: string | null;
  target_funding_type: FundingInputContract["type"];
  target_financial_account_id: string | null;
  version: string;
  created_at: Date;
  updated_at: Date;
};

function toDefaultView(row?: DefaultRow): OrganizationFundingDefaultContract {
  if (!row) {
    return {
      defaultFunding: { type: "owner_paid" },
      version: "0",
    };
  }
  return {
    defaultFunding: {
      type: row.default_funding_type,
      ...(row.default_financial_account_id
        ? { financialAccountId: row.default_financial_account_id }
        : {}),
    },
    version: row.version,
    updatedAt: row.updated_at.toISOString(),
  };
}

function toRuleView(row: RuleRow): FundingRuleContract {
  return {
    id: row.id,
    name: row.name,
    priority: row.priority,
    isActive: row.is_active,
    match: {
      externalSystem: row.match_external_system,
      supplierTaxId: row.match_supplier_tax_id,
      categoryCode: row.match_category_code,
      keyword: row.match_keyword,
      minAmountMinor: row.match_min_amount_minor,
      maxAmountMinor: row.match_max_amount_minor,
    },
    target: {
      type: row.target_funding_type,
      ...(row.target_financial_account_id
        ? { financialAccountId: row.target_financial_account_id }
        : {}),
    },
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

@Injectable()
export class PgFundingRulesStore implements FundingRulesStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  private async checkReplay<T>(
    client: PoolClient,
    organizationId: string,
    key: string,
    _op: string,
    requestHash: string,
  ): Promise<T | undefined> {
    const existing = await client.query<{ request_hash: string; response_body: T }>(
      `select request_hash,response_body from api_idempotency_records
        where organization_id=$1 and idempotency_key=$2 for update`,
      [organizationId, key],
    );
    const row = existing.rows[0];
    if (!row) return undefined;
    if (row.request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
    return row.response_body;
  }

  private async saveReplay(
    client: PoolClient,
    organizationId: string,
    key: string,
    op: string,
    requestHash: string,
    payload: unknown,
  ) {
    await client.query(
      `insert into api_idempotency_records(organization_id,idempotency_key,operation,request_hash,response_body)
       values($1,$2,$3,$4,$5)
       on conflict(organization_id,idempotency_key) do nothing`,
      [organizationId, key, op, requestHash, payload],
    );
  }

  private async assertFinancialAccount(
    client: PoolClient,
    organizationId: string,
    funding: FundingInputContract,
  ) {
    if (funding.type === "owner_paid") return;
    const accountId = funding.financialAccountId?.trim();
    if (!accountId) throw new Error("FUNDING_FINANCIAL_ACCOUNT_REQUIRED");
    const found = await client.query<{ status: string; kind: string }>(
      `select status::text,kind::text from financial_accounts where organization_id=$1 and id=$2`,
      [organizationId, accountId],
    );
    const row = found.rows[0];
    if (!row || row.status !== "active") throw new Error("FINANCIAL_ACCOUNT_NOT_FOUND");
  }

  async list(organizationId: string) {
    const [def, rules] = await Promise.all([
      this.pool.query<DefaultRow>(
        `select default_funding_type,default_financial_account_id,version::text,updated_at
           from organization_funding_defaults where organization_id=$1`,
        [organizationId],
      ),
      this.pool.query<RuleRow>(
        `select id,name,priority,is_active,match_external_system,match_supplier_tax_id,
                match_category_code,match_keyword,match_min_amount_minor::text,
                match_max_amount_minor::text,target_funding_type,target_financial_account_id,
                version::text,created_at,updated_at
           from funding_rules
          where organization_id=$1
          order by priority asc, created_at asc, id asc`,
        [organizationId],
      ),
    ]);
    return {
      defaultFunding: toDefaultView(def.rows[0]),
      rules: rules.rows.map(toRuleView),
    };
  }

  async findPartyTaxId(organizationId: string, partyId: string): Promise<string | undefined> {
    const res = await this.pool.query<{ normalized_tax_id: string | null }>(
      `select normalized_tax_id from parties where organization_id=$1 and id=$2`,
      [organizationId, partyId],
    );
    return res.rows[0]?.normalized_tax_id?.trim() || undefined;
  }

  async setDefault(
    context: FundingRulesContext,
    funding: FundingInputContract,
    idempotencyKey: string,
  ) {
    const op = "funding-rules:set-default";
    const requestHash = createHash("sha256").update(JSON.stringify(funding)).digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.checkReplay<{ defaultFunding: OrganizationFundingDefaultContract }>(
        client,
        context.organizationId,
        idempotencyKey,
        op,
        requestHash,
      );
      if (replay) {
        await client.query("commit");
        return { ...replay, idempotencyReplayed: true };
      }
      await this.assertFinancialAccount(client, context.organizationId, funding);
      const upserted = await client.query<DefaultRow>(
        `insert into organization_funding_defaults
           (organization_id,default_funding_type,default_financial_account_id,updated_by,updated_at,version)
         values($1,$2,$3,$4,now(),1)
         on conflict(organization_id) do update set
           default_funding_type=excluded.default_funding_type,
           default_financial_account_id=excluded.default_financial_account_id,
           updated_by=excluded.updated_by,
           updated_at=now(),
           version=organization_funding_defaults.version+1
         returning default_funding_type,default_financial_account_id,version::text,updated_at`,
        [
          context.organizationId,
          funding.type,
          funding.type === "owner_paid" ? null : (funding.financialAccountId?.trim() ?? null),
          context.actorId,
        ],
      );
      const defaultFunding = toDefaultView(upserted.rows[0]);
      await client.query(
        `insert into resource_audit_events
           (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
         values($1,$2,'organization_funding_default',$1,$3,'set_default',$4,$5,$6)`,
        [
          context.organizationId,
          randomUUID(),
          defaultFunding.version,
          context.actorId,
          context.correlationId,
          defaultFunding,
        ],
      );
      const response = { defaultFunding };
      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey,
        op,
        requestHash,
        response,
      );
      await client.query("commit");
      return { ...response, idempotencyReplayed: false };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async createRule(
    context: FundingRulesContext,
    input: CreateFundingRuleInput,
    idempotencyKey: string,
  ) {
    const op = "funding-rules:create";
    const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.checkReplay<{ rule: FundingRuleContract }>(
        client,
        context.organizationId,
        idempotencyKey,
        op,
        requestHash,
      );
      if (replay) {
        await client.query("commit");
        return { ...replay, idempotencyReplayed: true };
      }
      await this.assertFinancialAccount(client, context.organizationId, input.target);
      const id = input.id?.trim() || randomUUID();
      const m = input.match ?? {};
      const inserted = await client.query<RuleRow>(
        `insert into funding_rules(
           organization_id,id,name,priority,is_active,match_external_system,match_supplier_tax_id,
           match_category_code,match_keyword,match_min_amount_minor,match_max_amount_minor,
           target_funding_type,target_financial_account_id,created_by,updated_by
         ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
         returning id,name,priority,is_active,match_external_system,match_supplier_tax_id,
                   match_category_code,match_keyword,match_min_amount_minor::text,
                   match_max_amount_minor::text,target_funding_type,target_financial_account_id,
                   version::text,created_at,updated_at`,
        [
          context.organizationId,
          id,
          input.name.trim(),
          input.priority ?? 100,
          input.isActive ?? true,
          m.externalSystem?.trim() || null,
          m.supplierTaxId?.trim() || null,
          m.categoryCode?.trim() || null,
          m.keyword?.trim() || null,
          m.minAmountMinor ?? null,
          m.maxAmountMinor ?? null,
          input.target.type,
          input.target.type === "owner_paid"
            ? null
            : (input.target.financialAccountId?.trim() ?? null),
          context.actorId,
        ],
      );
      const rule = toRuleView(inserted.rows[0]!);
      await client.query(
        `insert into resource_audit_events
           (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
         values($1,$2,'funding_rule',$3,$4,'create',$5,$6,$7)`,
        [
          context.organizationId,
          randomUUID(),
          rule.id,
          rule.version,
          context.actorId,
          context.correlationId,
          rule,
        ],
      );
      const response = { rule };
      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey,
        op,
        requestHash,
        response,
      );
      await client.query("commit");
      return { ...response, idempotencyReplayed: false };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateRule(
    context: FundingRulesContext,
    ruleId: string,
    expectedVersion: string,
    input: UpdateFundingRuleInput,
    idempotencyKey: string,
  ) {
    const op = "funding-rules:update";
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ ruleId, expectedVersion, input }))
      .digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.checkReplay<{ rule: FundingRuleContract }>(
        client,
        context.organizationId,
        idempotencyKey,
        op,
        requestHash,
      );
      if (replay) {
        await client.query("commit");
        return { ...replay, idempotencyReplayed: true };
      }
      const found = await client.query<RuleRow>(
        `select id,name,priority,is_active,match_external_system,match_supplier_tax_id,
                match_category_code,match_keyword,match_min_amount_minor::text,
                match_max_amount_minor::text,target_funding_type,target_financial_account_id,
                version::text,created_at,updated_at
           from funding_rules where organization_id=$1 and id=$2 for update`,
        [context.organizationId, ruleId],
      );
      const current = found.rows[0];
      if (!current) throw new Error("RESOURCE_NOT_FOUND");
      if (current.version !== expectedVersion) throw new Error("VERSION_CONFLICT");

      const target = input.target ?? {
        type: current.target_funding_type,
        ...(current.target_financial_account_id
          ? { financialAccountId: current.target_financial_account_id }
          : {}),
      };
      await this.assertFinancialAccount(client, context.organizationId, target);

      const m = input.match;
      const updated = await client.query<RuleRow>(
        `update funding_rules set
           name=$3, priority=$4, is_active=$5,
           match_external_system=$6, match_supplier_tax_id=$7, match_category_code=$8,
           match_keyword=$9, match_min_amount_minor=$10, match_max_amount_minor=$11,
           target_funding_type=$12, target_financial_account_id=$13,
           updated_by=$14, updated_at=now(), version=version+1
         where organization_id=$1 and id=$2
         returning id,name,priority,is_active,match_external_system,match_supplier_tax_id,
                   match_category_code,match_keyword,match_min_amount_minor::text,
                   match_max_amount_minor::text,target_funding_type,target_financial_account_id,
                   version::text,created_at,updated_at`,
        [
          context.organizationId,
          ruleId,
          input.name !== undefined ? input.name.trim() : current.name,
          input.priority ?? current.priority,
          input.isActive ?? current.is_active,
          m && "externalSystem" in m
            ? m.externalSystem?.trim() || null
            : current.match_external_system,
          m && "supplierTaxId" in m
            ? m.supplierTaxId?.trim() || null
            : current.match_supplier_tax_id,
          m && "categoryCode" in m ? m.categoryCode?.trim() || null : current.match_category_code,
          m && "keyword" in m ? m.keyword?.trim() || null : current.match_keyword,
          m && "minAmountMinor" in m ? (m.minAmountMinor ?? null) : current.match_min_amount_minor,
          m && "maxAmountMinor" in m ? (m.maxAmountMinor ?? null) : current.match_max_amount_minor,
          target.type,
          target.type === "owner_paid" ? null : (target.financialAccountId?.trim() ?? null),
          context.actorId,
        ],
      );
      const rule = toRuleView(updated.rows[0]!);
      await client.query(
        `insert into resource_audit_events
           (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
         values($1,$2,'funding_rule',$3,$4,'update',$5,$6,$7,$8)`,
        [
          context.organizationId,
          randomUUID(),
          rule.id,
          rule.version,
          context.actorId,
          context.correlationId,
          toRuleView(current),
          rule,
        ],
      );
      const response = { rule };
      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey,
        op,
        requestHash,
        response,
      );
      await client.query("commit");
      return { ...response, idempotencyReplayed: false };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteRule(
    context: FundingRulesContext,
    ruleId: string,
    expectedVersion: string,
    idempotencyKey: string,
  ) {
    const op = "funding-rules:delete";
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ ruleId, expectedVersion }))
      .digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.checkReplay<{ deleted: true; ruleId: string }>(
        client,
        context.organizationId,
        idempotencyKey,
        op,
        requestHash,
      );
      if (replay) {
        await client.query("commit");
        return { ...replay, idempotencyReplayed: true };
      }
      const found = await client.query<RuleRow>(
        `select id,name,priority,is_active,match_external_system,match_supplier_tax_id,
                match_category_code,match_keyword,match_min_amount_minor::text,
                match_max_amount_minor::text,target_funding_type,target_financial_account_id,
                version::text,created_at,updated_at
           from funding_rules where organization_id=$1 and id=$2 for update`,
        [context.organizationId, ruleId],
      );
      const current = found.rows[0];
      if (!current) throw new Error("RESOURCE_NOT_FOUND");
      if (current.version !== expectedVersion) throw new Error("VERSION_CONFLICT");

      await client.query(`delete from funding_rules where organization_id=$1 and id=$2`, [
        context.organizationId,
        ruleId,
      ]);
      await client.query(
        `insert into resource_audit_events
           (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state)
         values($1,$2,'funding_rule',$3,$4,'delete',$5,$6,$7)`,
        [
          context.organizationId,
          randomUUID(),
          ruleId,
          current.version,
          context.actorId,
          context.correlationId,
          toRuleView(current),
        ],
      );
      const response = { deleted: true as const, ruleId };
      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey,
        op,
        requestHash,
        response,
      );
      await client.query("commit");
      return { ...response, idempotencyReplayed: false };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
