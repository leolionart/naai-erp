import { createHash, randomUUID } from "node:crypto";
import type { FundingRuleContract } from "@naai-erp/contracts";
import type { FundingRulesContext, UpdateFundingRuleInput } from "./funding-rules.types.js";
import { type RuleRow, toRuleView } from "./pg-funding-rules.store.shared.js";
import type { PgFundingRulesStore } from "./pg-funding-rules.store.js";

export async function updateRuleOperation(
  this: PgFundingRulesStore,
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
        m && "supplierTaxId" in m ? m.supplierTaxId?.trim() || null : current.match_supplier_tax_id,
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
