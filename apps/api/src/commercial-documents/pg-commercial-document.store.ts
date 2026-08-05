import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg, { type PoolClient } from "pg";
import type {
  CommercialDocumentAction,
  CommercialDocumentContext,
  CommercialDocumentType,
  CreateCommercialDocumentInput,
} from "./commercial-document.types.js";

type StoredDocument = {
  id: string;
  type: CommercialDocumentType;
  state: string;
  document_date: string;
  currency: string;
  party_id: string;
  document_number: string;
  net_minor: string;
  tax_minor: string;
  gross_minor: string;
  control_account_code: string;
  original_document_id: string | null;
  created_by: string;
  version: string;
};

const NEXT: Record<CommercialDocumentType, Record<string, Record<string, string>>> = {
  sales_invoice: {
    draft: { validate: "validated", cancel: "cancelled" },
    validated: { issue: "issued", cancel: "cancelled" },
  },
  purchase_invoice: {
    draft: { capture: "captured", cancel: "cancelled" },
    captured: { verify: "verified", cancel: "cancelled" },
    verified: { approve: "approved", cancel: "cancelled" },
    approved: { post: "posted" },
  },
  credit_note: {
    draft: { validate: "validated", cancel: "cancelled" },
    validated: { issue: "issued", cancel: "cancelled" },
  },
};

@Injectable()
export class PgCommercialDocumentStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async list(organizationId: string, filters: { type?: string; state?: string; partyId?: string }) {
    const result = await this.pool.query(
      `select d.*,coalesce(json_agg(l order by l.line_number) filter (where l.line_number is not null),'[]') lines
       from commercial_documents d left join commercial_document_lines l
         on l.organization_id=d.organization_id and l.document_id=d.id
       where d.organization_id=$1 and ($2::text is null or d.type::text=$2)
         and ($3::text is null or d.state::text=$3) and ($4::text is null or d.party_id=$4)
       group by d.organization_id,d.id order by d.document_date desc,d.id`,
      [organizationId, filters.type ?? null, filters.state ?? null, filters.partyId ?? null],
    );
    return result.rows;
  }

  async get(organizationId: string, id: string) {
    const result = await this.pool.query(
      `select d.*,coalesce(json_agg(jsonb_build_object(
        'lineNumber',l.line_number,'description',l.description,'quantity',l.quantity,
        'unitPriceMinor',l.unit_price_minor::text,'netMinor',l.net_minor::text,
        'taxMinor',l.tax_minor::text,'grossMinor',l.gross_minor::text,
        'primaryAccountCode',l.primary_account_code,'taxAccountCode',l.tax_account_code,
        'taxCode',l.tax_code,'dimensions',l.dimensions,
        'allocations',(select coalesce(json_agg(a order by a.allocation_number),'[]')
          from commercial_document_allocations a where a.organization_id=l.organization_id
            and a.document_id=l.document_id and a.line_number=l.line_number))
        order by l.line_number) filter (where l.line_number is not null),'[]') lines
       from commercial_documents d left join commercial_document_lines l
         on l.organization_id=d.organization_id and l.document_id=d.id
       where d.organization_id=$1 and d.id=$2 group by d.organization_id,d.id`,
      [organizationId, id],
    );
    return result.rows[0];
  }

  async create(
    context: CommercialDocumentContext,
    input: CreateCommercialDocumentInput,
    idempotencyKey: string,
  ) {
    const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.lockReplay(
        client,
        context.organizationId,
        idempotencyKey,
        requestHash,
      );
      if (replay) {
        await client.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }
      const id = input.id ?? randomUUID();
      if (input.type === "credit_note")
        await this.assertCreditAllowed(client, context.organizationId, input);
      await client.query(
        `insert into commercial_documents
         (organization_id,id,type,state,document_number,series,fiscal_year,party_id,document_date,due_date,
          currency,net_minor,tax_minor,gross_minor,control_account_code,original_document_id,created_by)
         values ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          context.organizationId,
          id,
          input.type,
          input.documentNumber,
          input.series ?? null,
          input.fiscalYear,
          input.partyId,
          input.documentDate,
          input.dueDate,
          input.currency,
          input.netMinor,
          input.taxMinor,
          input.grossMinor,
          input.controlAccountCode,
          input.originalDocumentId ?? null,
          context.actorId,
        ],
      );
      for (const [lineIndex, line] of input.lines.entries()) {
        await client.query(
          `insert into commercial_document_lines
           (organization_id,document_id,line_number,original_line_number,description,quantity,unit_price_minor,net_minor,tax_minor,gross_minor,
            primary_account_code,tax_account_code,tax_code,dimensions)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            context.organizationId,
            id,
            lineIndex + 1,
            line.originalLineNumber ?? null,
            line.description,
            line.quantity,
            line.unitPriceMinor,
            line.netMinor,
            line.taxMinor,
            line.grossMinor,
            line.primaryAccountCode,
            line.taxAccountCode ?? null,
            line.taxCode ?? null,
            line.dimensions ?? {},
          ],
        );
        for (const [allocationIndex, allocation] of line.allocations.entries())
          await client.query(
            `insert into commercial_document_allocations
             (organization_id,document_id,line_number,allocation_number,amount_minor,dimensions)
             values ($1,$2,$3,$4,$5,$6)`,
            [
              context.organizationId,
              id,
              lineIndex + 1,
              allocationIndex + 1,
              allocation.amountMinor,
              { ...allocation.dimensions, allocationId: allocation.id },
            ],
          );
      }
      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state)
         values ($1,$2,'commercial_document',$3,1,'create',$4,$5,$6)`,
        [
          context.organizationId,
          auditEventId,
          id,
          context.actorId,
          context.correlationId,
          { type: input.type, state: "draft" },
        ],
      );
      await client.query(
        `insert into outbox_events
         (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
         values ($1,$2,'commercial_document',$3,$4,1,$5,$6)`,
        [
          context.organizationId,
          outboxEventId,
          id,
          `${input.type}.created`,
          { documentId: id, type: input.type, state: "draft" },
          context.correlationId,
        ],
      );
      const response = {
        documentId: id,
        type: input.type,
        state: "draft",
        resourceVersion: "1",
        auditEventId,
        outboxEventId,
        nextActions: this.nextActions(input.type, "draft"),
      };
      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey,
        "commercial-document:create",
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

  async transition(
    context: CommercialDocumentContext,
    id: string,
    action: CommercialDocumentAction,
    reason: string,
    idempotencyKey: string,
  ) {
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ id, action, reason }))
      .digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await this.lockReplay(
        client,
        context.organizationId,
        idempotencyKey,
        requestHash,
      );
      if (replay) {
        await client.query("rollback");
        return { ...replay, idempotencyReplayed: true };
      }
      const found = await client.query<StoredDocument>(
        `select id,type,state,document_date::text,currency,party_id,document_number,net_minor::text,tax_minor::text,
          gross_minor::text,control_account_code,original_document_id,created_by,version::text
         from commercial_documents where organization_id=$1 and id=$2 for update`,
        [context.organizationId, id],
      );
      const document = found.rows[0];
      if (!document) throw new Error("RESOURCE_NOT_FOUND");
      const next = NEXT[document.type][document.state]?.[action];
      if (!next) throw new Error("INVALID_DOCUMENT_TRANSITION");
      if (action === "approve" && document.created_by === context.actorId)
        await this.assertSelfApproval(client, context.organizationId, BigInt(document.gross_minor));
      let journalId: string | undefined;
      if (action === "issue" || action === "post") {
        await this.assertPostingPeriod(client, context, document.document_date);
        journalId = await this.postDocumentJournal(client, context, document);
      }
      const version = (BigInt(document.version) + 1n).toString();
      await client.query(
        `update commercial_documents set state=$3,version=version+1,updated_at=now(),
          approved_by=case when $4='approve' then $5 else approved_by end,
          approved_at=case when $4='approve' then now() else approved_at end,
          issued_or_posted_by=case when $4 in ('issue','post') then $5 else issued_or_posted_by end,
          issued_or_posted_at=case when $4 in ('issue','post') then now() else issued_or_posted_at end,
          journal_id=coalesce($6::text,journal_id)
         where organization_id=$1 and id=$2`,
        [context.organizationId, id, next, action, context.actorId, journalId ?? null],
      );
      const eventId = randomUUID();
      const auditEventId = randomUUID();
      const outboxEventId = randomUUID();
      await client.query(
        `insert into commercial_document_events
         (organization_id,id,document_id,from_state,to_state,actor_id,reason,correlation_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          context.organizationId,
          eventId,
          id,
          document.state,
          next,
          context.actorId,
          reason,
          context.correlationId,
        ],
      );
      await client.query(
        `insert into resource_audit_events
         (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,reason,correlation_id,before_state,after_state)
         values ($1,$2,'commercial_document',$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          context.organizationId,
          auditEventId,
          id,
          version,
          action,
          context.actorId,
          reason,
          context.correlationId,
          { state: document.state },
          { state: next, journalId: journalId ?? null },
        ],
      );
      await client.query(
        `insert into outbox_events
         (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
         values ($1,$2,'commercial_document',$3,$4,1,$5,$6)`,
        [
          context.organizationId,
          outboxEventId,
          id,
          `${document.type}.${next}`,
          { documentId: id, type: document.type, state: next, journalId: journalId ?? null },
          context.correlationId,
        ],
      );
      const response = {
        documentId: id,
        type: document.type,
        state: next,
        resourceVersion: version,
        journalId: journalId ?? null,
        eventId,
        auditEventId,
        outboxEventId,
        nextActions: this.nextActions(document.type, next),
      };
      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey,
        `commercial-document:${action}`,
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

  private nextActions(type: CommercialDocumentType, state: string) {
    return Object.keys(NEXT[type][state] ?? {});
  }
  private async lockReplay(client: PoolClient, organizationId: string, key: string, hash: string) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${organizationId}:${key}`,
    ]);
    const replay = await client.query<{
      request_hash: string;
      response_body: Record<string, unknown>;
    }>(
      "select request_hash,response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2 for update",
      [organizationId, key],
    );
    if (!replay.rows[0]) return undefined;
    if (replay.rows[0].request_hash !== hash) throw new Error("IDEMPOTENCY_CONFLICT");
    return replay.rows[0].response_body;
  }
  private saveReplay(
    client: PoolClient,
    organizationId: string,
    key: string,
    operation: string,
    hash: string,
    response: unknown,
  ) {
    return client.query(
      `insert into api_idempotency_records
      (organization_id,idempotency_key,operation,request_hash,response_body) values ($1,$2,$3,$4,$5)`,
      [organizationId, key, operation, hash, response],
    );
  }
  private async assertSelfApproval(client: PoolClient, organizationId: string, total: bigint) {
    const policy = await client.query<{
      allow_self_approval: boolean;
      self_approval_max_minor: string | null;
    }>(
      "select allow_self_approval,self_approval_max_minor from accounting_workflow_policies where organization_id=$1",
      [organizationId],
    );
    if (
      !policy.rows[0]?.allow_self_approval ||
      total > BigInt(policy.rows[0].self_approval_max_minor ?? "-1")
    )
      throw new Error("MAKER_CHECKER_VIOLATION");
  }
  private async assertPostingPeriod(
    client: PoolClient,
    context: CommercialDocumentContext,
    date: string,
  ) {
    const period = await client.query<{ state: string }>(
      `select state from fiscal_periods where organization_id=$1 and $2::date between starts_on and ends_on`,
      [context.organizationId, date],
    );
    if (period.rows.length !== 1)
      throw new Error(period.rows.length ? "FISCAL_PERIOD_AMBIGUOUS" : "FISCAL_PERIOD_NOT_FOUND");
    if (period.rows[0]!.state === "hard_locked") throw new Error("PERIOD_HARD_LOCKED");
    if (
      period.rows[0]!.state === "soft_locked" &&
      !context.roles.some((r) => ["owner", "finance_admin"].includes(r))
    )
      throw new Error("PERIOD_SOFT_LOCKED");
  }
  private async assertCreditAllowed(
    client: PoolClient,
    organizationId: string,
    input: CreateCommercialDocumentInput,
  ) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${organizationId}:credit:${input.originalDocumentId}`,
    ]);
    const original = await client.query<{
      type: string;
      party_id: string;
      currency: string;
      net_minor: string;
      tax_minor: string;
      state: string;
    }>(
      `select type,party_id,currency,net_minor::text,tax_minor::text,state from commercial_documents
       where organization_id=$1 and id=$2 for update`,
      [organizationId, input.originalDocumentId],
    );
    const row = original.rows[0];
    if (
      !row ||
      row.type !== "sales_invoice" ||
      !["issued", "partially_paid", "paid"].includes(row.state)
    )
      throw new Error("CREDIT_ORIGINAL_INVALID");
    if (row.party_id !== input.partyId || row.currency !== input.currency)
      throw new Error("CREDIT_ORIGINAL_MISMATCH");
    const credited = await client.query<{ net: string; tax: string }>(
      `select coalesce(sum(net_minor),0)::text net,coalesce(sum(tax_minor),0)::text tax
      from commercial_documents where organization_id=$1 and type='credit_note' and original_document_id=$2
        and state not in ('cancelled')`,
      [organizationId, input.originalDocumentId],
    );
    if (
      BigInt(credited.rows[0]!.net) + BigInt(input.netMinor) > BigInt(row.net_minor) ||
      BigInt(credited.rows[0]!.tax) + BigInt(input.taxMinor) > BigInt(row.tax_minor)
    )
      throw new Error("CREDIT_EXCEEDS_REMAINING");
    for (const line of input.lines) {
      if (!line.originalLineNumber) throw new Error("CREDIT_ORIGINAL_LINE_REQUIRED");
      const originalLine = await client.query<{
        net_minor: string;
        tax_minor: string;
        primary_account_code: string;
        tax_account_code: string | null;
      }>(
        `select net_minor::text,tax_minor::text,primary_account_code,tax_account_code
         from commercial_document_lines where organization_id=$1 and document_id=$2 and line_number=$3`,
        [organizationId, input.originalDocumentId, line.originalLineNumber],
      );
      const source = originalLine.rows[0];
      if (
        !source ||
        source.primary_account_code !== line.primaryAccountCode ||
        source.tax_account_code !== (line.taxAccountCode ?? null)
      )
        throw new Error("CREDIT_ORIGINAL_LINE_INVALID");
      const prior = await client.query<{ net: string; tax: string }>(
        `select coalesce(sum(l.net_minor),0)::text net,coalesce(sum(l.tax_minor),0)::text tax
         from commercial_document_lines l join commercial_documents d
           on d.organization_id=l.organization_id and d.id=l.document_id
         where d.organization_id=$1 and d.type='credit_note' and d.original_document_id=$2
           and d.state<>'cancelled' and l.original_line_number=$3`,
        [organizationId, input.originalDocumentId, line.originalLineNumber],
      );
      if (
        BigInt(prior.rows[0]!.net) + BigInt(line.netMinor) > BigInt(source.net_minor) ||
        BigInt(prior.rows[0]!.tax) + BigInt(line.taxMinor) > BigInt(source.tax_minor)
      )
        throw new Error("CREDIT_EXCEEDS_REMAINING");
    }
  }

  private async postDocumentJournal(
    client: PoolClient,
    context: CommercialDocumentContext,
    document: StoredDocument,
  ) {
    const journalId = randomUUID();
    const lines = await client.query<{
      line_number: number;
      description: string;
      net_minor: string;
      tax_minor: string;
      primary_account_code: string;
      tax_account_code: string | null;
      dimensions: Record<string, string>;
    }>(
      `select line_number,description,net_minor::text,tax_minor::text,primary_account_code,tax_account_code,dimensions
       from commercial_document_lines where organization_id=$1 and document_id=$2 order by line_number`,
      [context.organizationId, document.id],
    );
    const journalLines: Array<{
      account: string;
      debit?: bigint;
      credit?: bigint;
      description: string;
      dimensions: Record<string, string>;
    }> = [];
    for (const line of lines.rows) {
      const allocations = await client.query<{
        amount_minor: string;
        dimensions: Record<string, string>;
      }>(
        `select amount_minor::text,dimensions from commercial_document_allocations
         where organization_id=$1 and document_id=$2 and line_number=$3 order by allocation_number`,
        [context.organizationId, document.id, line.line_number],
      );
      if (
        allocations.rows.reduce((sum, allocation) => sum + BigInt(allocation.amount_minor), 0n) !==
        BigInt(line.net_minor)
      )
        throw new Error("DOCUMENT_ALLOCATION_MISMATCH");
      let allocatedTax = 0n;
      for (const [index, allocation] of allocations.rows.entries()) {
        const net = BigInt(allocation.amount_minor);
        const tax =
          index === allocations.rows.length - 1
            ? BigInt(line.tax_minor) - allocatedTax
            : (BigInt(line.tax_minor) * net) / BigInt(line.net_minor);
        allocatedTax += tax;
        const dimensions = {
          ...line.dimensions,
          ...allocation.dimensions,
          partyId: document.party_id,
          sourceDocumentId: document.id,
          sourceLineNumber: String(line.line_number),
        };
        if (document.type === "sales_invoice") {
          journalLines.push({
            account: line.primary_account_code,
            credit: net,
            description: line.description,
            dimensions,
          });
          if (tax > 0n)
            journalLines.push({
              account: line.tax_account_code!,
              credit: tax,
              description: `VAT ${line.description}`,
              dimensions,
            });
        } else if (document.type === "purchase_invoice") {
          journalLines.push({
            account: line.primary_account_code,
            debit: net,
            description: line.description,
            dimensions,
          });
          if (tax > 0n)
            journalLines.push({
              account: line.tax_account_code!,
              debit: tax,
              description: `VAT ${line.description}`,
              dimensions,
            });
        } else {
          journalLines.push({
            account: line.primary_account_code,
            debit: net,
            description: line.description,
            dimensions,
          });
          if (tax > 0n)
            journalLines.push({
              account: line.tax_account_code!,
              debit: tax,
              description: `VAT credit ${line.description}`,
              dimensions,
            });
        }
      }
    }
    const controlDimensions = {
      partyId: document.party_id,
      sourceDocumentId: document.id,
      documentNumber: document.document_number,
    };
    journalLines.push(
      document.type === "purchase_invoice"
        ? {
            account: document.control_account_code,
            credit: BigInt(document.gross_minor),
            description: document.document_number,
            dimensions: controlDimensions,
          }
        : document.type === "credit_note"
          ? {
              account: document.control_account_code,
              credit: BigInt(document.gross_minor),
              description: document.document_number,
              dimensions: controlDimensions,
            }
          : {
              account: document.control_account_code,
              debit: BigInt(document.gross_minor),
              description: document.document_number,
              dimensions: controlDimensions,
            },
    );
    const debit = journalLines.reduce((s, l) => s + (l.debit ?? 0n), 0n);
    const credit = journalLines.reduce((s, l) => s + (l.credit ?? 0n), 0n);
    if (debit !== credit) throw new Error("JOURNAL_UNBALANCED");
    await client.query(
      `insert into journal_entries
      (organization_id,id,journal_date,description,currency,state,version,created_by,approved_at,approved_by,approval_reason,posted_at,posted_by)
      values ($1,$2,$3,$4,$5,'posted',2,$6,now(),$6,'Commercial document workflow',now(),$6)`,
      [
        context.organizationId,
        journalId,
        document.document_date,
        `${document.type} ${document.document_number}`,
        document.currency,
        context.actorId,
      ],
    );
    for (const [index, line] of journalLines.entries())
      await client.query(
        `insert into journal_lines
      (organization_id,journal_id,line_number,account_code,debit_minor,credit_minor,description,dimensions)
      values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          context.organizationId,
          journalId,
          index + 1,
          line.account,
          line.debit?.toString() ?? null,
          line.credit?.toString() ?? null,
          line.description,
          line.dimensions,
        ],
      );
    await client.query(
      `insert into outbox_events
      (organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id)
      values ($1,$2,'journal',$3,'journal.posted',1,$4,$5)`,
      [
        context.organizationId,
        randomUUID(),
        journalId,
        { journalId, sourceDocumentId: document.id },
        context.correlationId,
      ],
    );
    return journalId;
  }
}
