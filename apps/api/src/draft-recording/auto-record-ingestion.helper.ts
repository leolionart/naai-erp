import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { recordCommercialDocumentOnClient } from "./commercial-document-record.helper.js";
import {
  DEFAULT_AUTO_RECORD_REASON,
  makeReason,
  type DraftRecordReasonItem,
  type DraftRecordingActorContext,
} from "./draft-recording.types.js";
import { recordExpenseOnClient } from "./expense-record.helper.js";

export type AutoRecordIngestionContext = DraftRecordingActorContext & {
  autoRecord?: boolean;
};

export type IngestionAutoRecordOutcome = Readonly<{
  attempted: boolean;
  autoRecorded: boolean;
  finalState: string;
  resourceVersion: string;
  journalId: string | null;
  recordAuditEventId?: string;
  recordOutboxEventId?: string;
  reasons: readonly DraftRecordReasonItem[];
}>;

export async function attemptAutoRecordExpenseOnClient(
  client: PoolClient,
  context: AutoRecordIngestionContext,
  id: string,
  operatingMode: string,
  initialVersion = "1",
): Promise<IngestionAutoRecordOutcome> {
  if (operatingMode !== "solopreneur" || context.roles.includes("owner") || !context.autoRecord) {
    return {
      attempted: false,
      autoRecorded: false,
      finalState: "draft",
      resourceVersion: initialVersion,
      journalId: null,
      reasons: [],
    };
  }

  await client.query("savepoint auto_record_expense");
  try {
    const outcome = await recordExpenseOnClient(client, context, id, {
      reason: DEFAULT_AUTO_RECORD_REASON,
      autoRecorded: true,
    });
    if (outcome.found && outcome.ok) {
      await client.query("release savepoint auto_record_expense");
      return {
        attempted: true,
        autoRecorded: true,
        finalState: outcome.data.state,
        resourceVersion: outcome.data.resourceVersion,
        journalId: outcome.data.journalId,
        recordAuditEventId: outcome.data.auditEventId,
        recordOutboxEventId: outcome.data.outboxEventId,
        reasons: [],
      };
    }
    const reasons =
      outcome.found && !outcome.ok ? outcome.reasons : [makeReason("RESOURCE_NOT_FOUND")];
    await client.query("rollback to savepoint auto_record_expense");
    await client.query("release savepoint auto_record_expense");
    await persistDraftReasonsOnClient(client, context, "expense", id, initialVersion, reasons);
    return {
      attempted: true,
      autoRecorded: false,
      finalState: "draft",
      resourceVersion: initialVersion,
      journalId: null,
      reasons,
    };
  } catch (error) {
    await client.query("rollback to savepoint auto_record_expense");
    await client.query("release savepoint auto_record_expense");
    const code = error instanceof Error ? error.message : "AUTO_RECORD_FAILED";
    const reasons = [makeReason(code)];
    await persistDraftReasonsOnClient(client, context, "expense", id, initialVersion, reasons);
    return {
      attempted: true,
      autoRecorded: false,
      finalState: "draft",
      resourceVersion: initialVersion,
      journalId: null,
      reasons,
    };
  }
}

export async function attemptAutoRecordDocumentOnClient(
  client: PoolClient,
  context: AutoRecordIngestionContext,
  id: string,
  operatingMode: string,
  initialVersion = "1",
): Promise<IngestionAutoRecordOutcome> {
  if (operatingMode !== "solopreneur" || context.roles.includes("owner") || !context.autoRecord) {
    return {
      attempted: false,
      autoRecorded: false,
      finalState: "draft",
      resourceVersion: initialVersion,
      journalId: null,
      reasons: [],
    };
  }

  await client.query("savepoint auto_record_document");
  try {
    const outcome = await recordCommercialDocumentOnClient(client, context, id, {
      reason: DEFAULT_AUTO_RECORD_REASON,
      autoRecorded: true,
    });
    if (outcome.found && outcome.ok) {
      await client.query("release savepoint auto_record_document");
      return {
        attempted: true,
        autoRecorded: true,
        finalState: outcome.data.state,
        resourceVersion: outcome.data.resourceVersion,
        journalId: outcome.data.journalId,
        recordAuditEventId: outcome.data.auditEventId,
        recordOutboxEventId: outcome.data.outboxEventId,
        reasons: [],
      };
    }
    const reasons =
      outcome.found && !outcome.ok ? outcome.reasons : [makeReason("RESOURCE_NOT_FOUND")];
    await client.query("rollback to savepoint auto_record_document");
    await client.query("release savepoint auto_record_document");
    await persistDraftReasonsOnClient(
      client,
      context,
      "commercial_document",
      id,
      initialVersion,
      reasons,
    );
    return {
      attempted: true,
      autoRecorded: false,
      finalState: "draft",
      resourceVersion: initialVersion,
      journalId: null,
      reasons,
    };
  } catch (error) {
    await client.query("rollback to savepoint auto_record_document");
    await client.query("release savepoint auto_record_document");
    const code = error instanceof Error ? error.message : "AUTO_RECORD_FAILED";
    const reasons = [makeReason(code)];
    await persistDraftReasonsOnClient(
      client,
      context,
      "commercial_document",
      id,
      initialVersion,
      reasons,
    );
    return {
      attempted: true,
      autoRecorded: false,
      finalState: "draft",
      resourceVersion: initialVersion,
      journalId: null,
      reasons,
    };
  }
}

export async function finalizeExpenseCreateAuditAndOutbox(
  client: PoolClient,
  context: AutoRecordIngestionContext,
  params: {
    id: string;
    expenseClass: string;
    operatingMode: string;
    autoComplete: boolean;
    finalState: string;
    resourceVersion: string;
    journalId: string | null;
    nextActionsForState: (state: string) => readonly string[];
  },
) {
  const autoRec = params.autoComplete
    ? undefined
    : await attemptAutoRecordExpenseOnClient(
        client,
        context,
        params.id,
        params.operatingMode,
        params.resourceVersion,
      );
  const finalState = autoRec?.autoRecorded ? autoRec.finalState : params.finalState;
  const resourceVersion = autoRec?.autoRecorded ? autoRec.resourceVersion : params.resourceVersion;
  const journalId = autoRec?.autoRecorded ? autoRec.journalId : params.journalId;
  const auditEventId = randomUUID();
  const outboxEventId = autoRec?.recordOutboxEventId ?? randomUUID();

  await client.query(
    `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state) values($1,$2,'expense',$3,$4,'create',$5,$6,$7)`,
    [
      context.organizationId,
      auditEventId,
      params.id,
      resourceVersion,
      context.actorId,
      context.correlationId,
      {
        state: finalState,
        expenseClass: params.expenseClass,
        journalId,
        autoCompleted: params.autoComplete,
        ...(autoRec?.attempted
          ? { autoRecorded: autoRec.autoRecorded, reasons: autoRec.reasons }
          : {}),
      },
    ],
  );
  if (!autoRec?.autoRecorded) {
    await client.query(
      `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id) values($1,$2,'expense',$3,$4,1,$5,$6)`,
      [
        context.organizationId,
        outboxEventId,
        params.id,
        params.autoComplete ? `expense.${finalState}` : "expense.created",
        {
          expenseId: params.id,
          state: finalState,
          expenseClass: params.expenseClass,
          journalId,
          autoCompleted: params.autoComplete,
        },
        context.correlationId,
      ],
    );
  }
  return {
    expenseId: params.id,
    state: finalState,
    resourceVersion,
    journalId,
    auditEventId,
    outboxEventId,
    nextActions: params.nextActionsForState(finalState),
    ...(autoRec?.attempted
      ? {
          autoRecorded: autoRec.autoRecorded,
          reasons: autoRec.reasons,
          draftReasons: autoRec.reasons,
        }
      : {}),
  };
}

export async function finalizeDocumentCreateAuditAndOutbox(
  client: PoolClient,
  context: AutoRecordIngestionContext,
  params: {
    id: string;
    type: string;
    operatingMode: string;
    autoComplete: boolean;
    finalState: string;
    resourceVersion: string;
    journalId: string | null;
    migrationSourceExpenseId?: string;
    migrationSourceExpenseDate?: string;
    nextActionsForState: (state: string) => readonly string[];
  },
) {
  const autoRec = params.autoComplete
    ? undefined
    : await attemptAutoRecordDocumentOnClient(
        client,
        context,
        params.id,
        params.operatingMode,
        params.resourceVersion,
      );
  const finalState = autoRec?.autoRecorded ? autoRec.finalState : params.finalState;
  const resourceVersion = autoRec?.autoRecorded ? autoRec.resourceVersion : params.resourceVersion;
  const journalId = autoRec?.autoRecorded ? autoRec.journalId : params.journalId;
  const auditEventId = randomUUID();
  const outboxEventId = autoRec?.recordOutboxEventId ?? randomUUID();

  await client.query(
    `insert into resource_audit_events(organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,after_state) values($1,$2,'commercial_document',$3,$4,'create',$5,$6,$7)`,
    [
      context.organizationId,
      auditEventId,
      params.id,
      resourceVersion,
      context.actorId,
      context.correlationId,
      {
        type: params.type,
        state: finalState,
        journalId,
        autoCompleted: params.autoComplete,
        ...(autoRec?.attempted
          ? { autoRecorded: autoRec.autoRecorded, reasons: autoRec.reasons }
          : {}),
        ...(params.migrationSourceExpenseId
          ? {
              migrationSourceExpenseId: params.migrationSourceExpenseId,
              migrationSourceExpenseDate: params.migrationSourceExpenseDate,
            }
          : {}),
      },
    ],
  );
  if (!autoRec?.autoRecorded) {
    await client.query(
      `insert into outbox_events(organization_id,id,aggregate_type,aggregate_id,event_type,schema_version,payload,correlation_id) values($1,$2,'commercial_document',$3,$4,1,$5,$6)`,
      [
        context.organizationId,
        outboxEventId,
        params.id,
        params.autoComplete ? `${params.type}.${finalState}` : `${params.type}.created`,
        {
          documentId: params.id,
          type: params.type,
          state: finalState,
          journalId,
          autoCompleted: params.autoComplete,
        },
        context.correlationId,
      ],
    );
  }
  return {
    documentId: params.id,
    type: params.type,
    state: finalState,
    resourceVersion,
    journalId,
    auditEventId,
    outboxEventId,
    nextActions: params.nextActionsForState(finalState),
    ...(autoRec?.attempted
      ? {
          autoRecorded: autoRec.autoRecorded,
          reasons: autoRec.reasons,
          draftReasons: autoRec.reasons,
        }
      : {}),
  };
}

async function persistDraftReasonsOnClient(
  client: PoolClient,
  context: AutoRecordIngestionContext,
  resourceType: "expense" | "commercial_document",
  id: string,
  resourceVersion: string,
  reasons: readonly DraftRecordReasonItem[],
): Promise<void> {
  const table = resourceType === "expense" ? "expenses" : "commercial_documents";
  await client.query(
    `update ${table} set draft_reasons = $3::jsonb where organization_id = $1 and id = $2`,
    [context.organizationId, id, JSON.stringify(reasons)],
  );
  await client.query(
    `insert into resource_audit_events
       (organization_id, id, resource_type, resource_key, resource_version, action, actor_id, correlation_id, after_state)
     values ($1, $2, $3, $4, $5, 'auto_record_blocked', $6, $7, $8)`,
    [
      context.organizationId,
      randomUUID(),
      resourceType,
      id,
      resourceVersion,
      context.actorId,
      context.correlationId,
      { state: "draft", autoRecorded: false, reasons },
    ],
  );
}
