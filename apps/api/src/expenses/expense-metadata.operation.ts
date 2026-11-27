import { createHash, randomUUID } from "node:crypto";
import {
  applyExpenseLineCategoryUpdate,
  resolveExpenseCategory,
} from "../master-data/canonical-category-validation.js";
import type { ExpenseContext, ExpenseMetadataInput } from "./expense.types.js";
import { NEXT } from "./pg-expense.store.shared.js";
import type { PgExpenseStore } from "./pg-expense.store.js";

export async function updateMetadataOperation(
  this: PgExpenseStore,
  context: ExpenseContext,
  id: string,
  expectedVersion: string,
  input: ExpenseMetadataInput,
  key: string,
) {
  const hash = createHash("sha256")
    .update(JSON.stringify({ id, expectedVersion, input }))
    .digest("hex");
  const c = await this.pool.connect();
  try {
    await c.query("begin");
    const replay = await this.replay(c, context.organizationId, key, hash);
    if (replay) {
      await c.query("rollback");
      return { ...replay, idempotencyReplayed: true };
    }
    const expenseResult = await c.query<{
      state: string;
      version: string;
      payee_party_id: string | null;
      business_purpose: string;
      journal_id: string | null;
    }>(
      `select state::text,version::text,payee_party_id,business_purpose,journal_id
         from expenses where organization_id=$1 and id=$2 for update`,
      [context.organizationId, id],
    );
    const expense = expenseResult.rows[0];
    if (!expense) throw new Error("RESOURCE_NOT_FOUND");
    if (expense.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
    if (expense.state === "reversed") throw new Error("EXPENSE_FINAL_IMMUTABLE");

    if (input.payeePartyId) {
      const payee = await c.query(
        `with recursive chain(id,path) as (
           select $2::text,array[$2::text]
           union all select l.target_party_id,c.path||l.target_party_id
             from chain c join party_merge_links l
              on l.organization_id=$1 and l.source_party_id=c.id
             where not l.target_party_id=any(c.path)
         ) select 1 from chain c join parties p
           on p.organization_id=$1 and p.id=c.id and p.status='active'
           join party_roles r on r.organization_id=p.organization_id and r.party_id=p.id and r.role='supplier'
          limit 1`,
        [context.organizationId, input.payeePartyId],
      );
      if (!payee.rows[0]) throw new Error("PAYEE_SUPPLIER_NOT_FOUND");
    }
    const resolvedCategory = input.category
      ? await resolveExpenseCategory(c, context.organizationId, input.category)
      : undefined;
    if (input.customerPartyId) {
      const customer = await c.query(
        `with recursive chain(id,path) as (
           select $2::text,array[$2::text]
           union all select l.target_party_id,c.path||l.target_party_id
             from chain c join party_merge_links l
              on l.organization_id=$1 and l.source_party_id=c.id
             where not l.target_party_id=any(c.path)
         ) select 1 from chain c join parties p
           on p.organization_id=$1 and p.id=c.id and p.status='active'
           join party_roles r on r.organization_id=p.organization_id and r.party_id=p.id and r.role='client'
          limit 1`,
        [context.organizationId, input.customerPartyId],
      );
      if (!customer.rows[0]) throw new Error("CUSTOMER_CLIENT_NOT_FOUND");
    }
    if (input.projectId) {
      const project = await c.query<{ client_party_id: string; state: string }>(
        `select client_party_id,state::text from projects
           where organization_id=$1 and id=$2 and state in ('planned','active','on_hold','completed')`,
        [context.organizationId, input.projectId],
      );
      if (!project.rows[0]) throw new Error("PROJECT_NOT_FOUND");
      const targetProject = project.rows[0];
      // A project's customer is metadata context. When the expense carries an
      // explicit customer, accept merged/aliased party IDs but reject unrelated
      // customers without mutating financial facts.
      const customerParty = input.customerPartyId;
      if (customerParty) {
        const parties = await c.query<{ source_id: string; canonical_id: string }>(
          `with recursive chain(source_id,id,path) as (
             select p.id,p.id,array[p.id] from parties p
              where p.organization_id=$1 and p.id in ($2,$3)
             union all
             select c.source_id,l.target_party_id,c.path||l.target_party_id
               from chain c join party_merge_links l
                 on l.organization_id=$1 and l.source_party_id=c.id
              where not l.target_party_id=any(c.path)
           )
           select c.source_id,c.id canonical_id from chain c
            where not exists (
              select 1 from party_merge_links l
               where l.organization_id=$1 and l.source_party_id=c.id
                 and not l.target_party_id=any(c.path)
            )`,
          [context.organizationId, customerParty, targetProject.client_party_id],
        );
        const customerCanonical = parties.rows.find(
          (p) => p.source_id === customerParty,
        )?.canonical_id;
        const projectCanonical = parties.rows.find(
          (p) => p.source_id === targetProject.client_party_id,
        )?.canonical_id;
        if (!customerCanonical || !projectCanonical || customerCanonical !== projectCanonical)
          throw new Error("PROJECT_CUSTOMER_MISMATCH");
      }
    }

    const lines = await c.query<{
      line_number: number;
      description: string;
      category: string | null;
    }>(
      `select line_number,description,expense_category_code category
         from expense_lines where organization_id=$1 and expense_id=$2
        order by line_number for update`,
      [context.organizationId, id],
    );
    if (!lines.rows.length) throw new Error("RESOURCE_NOT_FOUND");
    const existingLineNumbers = new Set(lines.rows.map((line) => line.line_number));
    if (input.lineDescriptions?.some((line) => !existingLineNumbers.has(line.lineNumber)))
      throw new Error("EXPENSE_LINE_NOT_FOUND");

    await c.query("select set_config('app.expense_metadata_correction','on',true)");
    if (
      Object.prototype.hasOwnProperty.call(input, "payeePartyId") ||
      Object.prototype.hasOwnProperty.call(input, "businessPurpose")
    ) {
      await c.query(
        `update expenses set
           payee_party_id=case when $3 then $4::text else payee_party_id end,
           business_purpose=case when $5 then $6::text else business_purpose end
         where organization_id=$1 and id=$2`,
        [
          context.organizationId,
          id,
          Object.prototype.hasOwnProperty.call(input, "payeePartyId"),
          input.payeePartyId ?? null,
          Object.prototype.hasOwnProperty.call(input, "businessPurpose"),
          input.businessPurpose ?? null,
        ],
      );
    }
    if (Object.prototype.hasOwnProperty.call(input, "category")) {
      await applyExpenseLineCategoryUpdate(
        c,
        context.organizationId,
        id,
        input.category ?? null,
        resolvedCategory,
      );
    }
    if (Object.prototype.hasOwnProperty.call(input, "projectId")) {
      await c.query(
        `update expense_lines set dimensions=case
           when $3::text is null then coalesce(dimensions,'{}'::jsonb)-'projectId'
           else coalesce(dimensions,'{}'::jsonb)||jsonb_build_object('projectId',$3::text)
         end where organization_id=$1 and expense_id=$2`,
        [context.organizationId, id, input.projectId ?? null],
      );
    }
    if (Object.prototype.hasOwnProperty.call(input, "customerPartyId")) {
      await c.query(
        `update expense_lines set dimensions=case
           when $3::text is null then coalesce(dimensions,'{}'::jsonb)-'customerPartyId'
           else coalesce(dimensions,'{}'::jsonb)||jsonb_build_object('customerPartyId',$3::text)
         end where organization_id=$1 and expense_id=$2`,
        [context.organizationId, id, input.customerPartyId ?? null],
      );
    }
    for (const line of input.lineDescriptions ?? []) {
      await c.query(
        `update expense_lines set description=$4
          where organization_id=$1 and expense_id=$2 and line_number=$3`,
        [context.organizationId, id, line.lineNumber, line.description],
      );
    }

    const resourceVersion = (BigInt(expense.version) + 1n).toString();
    await c.query(
      "update expenses set version=$3,updated_at=now() where organization_id=$1 and id=$2",
      [context.organizationId, id, resourceVersion],
    );
    const auditEventId = randomUUID();
    const outboxEventId = randomUUID();
    const beforeState = {
      payeePartyId: expense.payee_party_id,
      businessPurpose: expense.business_purpose,
      journalId: expense.journal_id,
      lines: lines.rows.map((line) => ({
        lineNumber: line.line_number,
        description: line.description,
        category: line.category,
      })),
    };
    const afterState = {
      payeePartyId: Object.prototype.hasOwnProperty.call(input, "payeePartyId")
        ? (input.payeePartyId ?? null)
        : expense.payee_party_id,
      businessPurpose: input.businessPurpose ?? expense.business_purpose,
      category: Object.prototype.hasOwnProperty.call(input, "category")
        ? (input.category ?? null)
        : undefined,
      projectId: Object.prototype.hasOwnProperty.call(input, "projectId")
        ? (input.projectId ?? null)
        : undefined,
      customerPartyId: Object.prototype.hasOwnProperty.call(input, "customerPartyId")
        ? (input.customerPartyId ?? null)
        : undefined,
      lineDescriptions: input.lineDescriptions ?? [],
      journalId: expense.journal_id,
    };
    await c.query(
      `insert into resource_audit_events
       (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
       values($1,$2,'expense',$3,$4,'update_metadata',$5,$6,$7,$8)`,
      [
        context.organizationId,
        auditEventId,
        id,
        resourceVersion,
        context.actorId,
        context.correlationId,
        beforeState,
        afterState,
      ],
    );
    await c.query(
      `insert into outbox_events
       (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
       values($1,$2,'expense',$3,'expense.metadata_updated',1,$4,$5)`,
      [
        context.organizationId,
        outboxEventId,
        id,
        { expenseId: id, resourceVersion },
        context.correlationId,
      ],
    );
    const response = {
      expenseId: id,
      state: expense.state,
      payeePartyId: afterState.payeePartyId,
      businessPurpose: afterState.businessPurpose,
      ...(Object.prototype.hasOwnProperty.call(input, "category")
        ? { category: input.category ?? null }
        : {}),
      lineDescriptions: input.lineDescriptions ?? [],
      resourceVersion,
      journalId: expense.journal_id,
      auditEventId,
      outboxEventId,
      nextActions: Object.keys(NEXT[expense.state] ?? {}),
    };
    await this.save(c, context.organizationId, key, "expense:update-metadata", hash, response);
    await c.query("commit");
    return { ...response, idempotencyReplayed: false };
  } catch (error) {
    await c.query("rollback");
    throw error;
  } finally {
    c.release();
  }
}

export async function updateCategoryOperation(
  this: PgExpenseStore,
  context: ExpenseContext,
  id: string,
  category: string,
  key: string,
) {
  const hash = createHash("sha256").update(JSON.stringify({ id, category })).digest("hex");
  const c = await this.pool.connect();
  try {
    await c.query("begin");
    const replay = await this.replay(c, context.organizationId, key, hash);
    if (replay) {
      await c.query("rollback");
      return { ...replay, idempotencyReplayed: true };
    }
    const expense = await c.query<{ version: string }>(
      "select version::text from expenses where organization_id=$1 and id=$2 for update",
      [context.organizationId, id],
    );
    if (!expense.rows[0]) throw new Error("RESOURCE_NOT_FOUND");
    const resolvedCategory = await resolveExpenseCategory(c, context.organizationId, category);
    const before = await c.query<{ line_number: number; category: string | null }>(
      "select line_number,coalesce(expense_category_code,dimensions->>'category') category from expense_lines where organization_id=$1 and expense_id=$2 order by line_number",
      [context.organizationId, id],
    );
    if (!before.rows.length) throw new Error("RESOURCE_NOT_FOUND");
    await c.query("select set_config('app.expense_metadata_correction','on',true)");
    await applyExpenseLineCategoryUpdate(c, context.organizationId, id, category, resolvedCategory);
    const version = BigInt(expense.rows[0].version) + 1n;
    await c.query(
      "update expenses set version=$3,updated_at=now() where organization_id=$1 and id=$2",
      [context.organizationId, id, version.toString()],
    );
    const auditEventId = randomUUID();
    await c.query(
      `insert into resource_audit_events
       (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
       values($1,$2,'expense',$3,$4,'update_category',$5,$6,$7,$8)`,
      [
        context.organizationId,
        auditEventId,
        id,
        version.toString(),
        context.actorId,
        context.correlationId,
        { lines: before.rows },
        { category },
      ],
    );
    const response = { expenseId: id, category, version: version.toString(), auditEventId };
    await this.save(c, context.organizationId, key, "expense:update-category", hash, response);
    await c.query("commit");
    return { ...response, idempotencyReplayed: false };
  } catch (error) {
    await c.query("rollback");
    throw error;
  } finally {
    c.release();
  }
}
