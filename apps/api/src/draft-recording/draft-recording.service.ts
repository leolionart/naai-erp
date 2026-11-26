import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import pg, { type PoolClient } from "pg";
import { MasterDataService } from "../master-data/master-data.service.js";
import { resolveOrganizationWorkflowPolicy } from "../workflow-policy/organization-workflow-policy.service.js";
import { recordCommercialDocumentOnClient } from "./commercial-document-record.helper.js";
import {
  BATCH_RECORD_MAX_ITEMS,
  discoverOrganizationDrafts,
  evaluateBatchDraftItemsOnClient,
  normalizeBatchItems,
} from "./draft-recording-batch.helper.js";
import {
  DEFAULT_SOLOPRENEUR_RECORD_REASON,
  createDraftRecordBlockedError,
  type BatchDraftRecordRequest,
  type DraftRecordingActorContext,
  type RecordSingleDraftInput,
} from "./draft-recording.types.js";
import { recordExpenseOnClient } from "./expense-record.helper.js";

@Injectable()
export class DraftRecordingService {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  constructor(@Inject(MasterDataService) private readonly masterData: MasterDataService) {}

  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }

  private envelope(context: DraftRecordingActorContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }

  private async assertSolopreneurOwner(
    client: PoolClient,
    context: DraftRecordingActorContext,
  ): Promise<void> {
    if (!context.roles.includes("owner")) {
      throw new Error("FORBIDDEN");
    }
    const policy = await resolveOrganizationWorkflowPolicy(context.organizationId, client);
    if (policy.operatingMode !== "solopreneur") {
      throw new Error("SOLOPRENEUR_POLICY_REQUIRED");
    }
  }

  async recordExpense(
    context: DraftRecordingActorContext,
    id: string,
    input: RecordSingleDraftInput = {},
    idempotencyKey?: string,
  ) {
    if (!context.roles.includes("owner")) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const reason = input.reason?.trim() || DEFAULT_SOLOPRENEUR_RECORD_REASON;
    const requirePaymentEvidence = Boolean(input.requirePaymentEvidence);
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ op: "expense:record", id, reason, requirePaymentEvidence }))
      .digest("hex");

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await this.assertSolopreneurOwner(client, context);
      const replay = await this.lockReplay(
        client,
        context.organizationId,
        idempotencyKey,
        requestHash,
      );
      if (replay) {
        await client.query("rollback");
        return this.envelope(context, { ...replay, idempotencyReplayed: true });
      }

      const outcome = await recordExpenseOnClient(client, context, id, {
        reason,
        requirePaymentEvidence,
      });
      if (!outcome.found) {
        await client.query("rollback");
        throw new Error("RESOURCE_NOT_FOUND");
      }
      if (!outcome.ok) {
        await client.query("rollback");
        throw createDraftRecordBlockedError("expense", id, outcome.reasons);
      }

      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey,
        "expense:record",
        requestHash,
        outcome.data,
      );
      await client.query("commit");
      return this.envelope(context, { ...outcome.data, idempotencyReplayed: false });
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async recordCommercialDocument(
    context: DraftRecordingActorContext,
    id: string,
    input: RecordSingleDraftInput = {},
    idempotencyKey?: string,
  ) {
    if (!context.roles.includes("owner")) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const reason = input.reason?.trim() || DEFAULT_SOLOPRENEUR_RECORD_REASON;
    const requirePaymentEvidence = Boolean(input.requirePaymentEvidence);
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({ op: "commercial-document:record", id, reason, requirePaymentEvidence }),
      )
      .digest("hex");

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await this.assertSolopreneurOwner(client, context);
      const replay = await this.lockReplay(
        client,
        context.organizationId,
        idempotencyKey,
        requestHash,
      );
      if (replay) {
        await client.query("rollback");
        return this.envelope(context, { ...replay, idempotencyReplayed: true });
      }

      const outcome = await recordCommercialDocumentOnClient(client, context, id, {
        reason,
        requirePaymentEvidence,
      });
      if (!outcome.found) {
        await client.query("rollback");
        throw new Error("RESOURCE_NOT_FOUND");
      }
      if (!outcome.ok) {
        await client.query("rollback");
        throw createDraftRecordBlockedError("commercial_document", id, outcome.reasons);
      }

      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey,
        "commercial-document:record",
        requestHash,
        outcome.data,
      );
      await client.query("commit");
      return this.envelope(context, { ...outcome.data, idempotencyReplayed: false });
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async recordBatch(
    context: DraftRecordingActorContext,
    body: BatchDraftRecordRequest = {},
    idempotencyKey?: string,
  ) {
    if (!context.roles.includes("owner")) throw new Error("FORBIDDEN");
    const isCommit = body.commit === true || body.dryRun === false;
    const isDryRun = body.dryRun === true;
    if ((isCommit && isDryRun) || (!isCommit && !isDryRun)) {
      throw new Error("VALIDATION_FAILED");
    }
    const reason = body.reason?.trim() || DEFAULT_SOLOPRENEUR_RECORD_REASON;
    const requirePaymentEvidence = Boolean(body.requirePaymentEvidence);
    const planHashInput = body.planHash?.trim() ?? "";
    if (isCommit) {
      if (!planHashInput) throw new Error("VALIDATION_FAILED");
      if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    }
    if (body.items !== undefined && !Array.isArray(body.items)) {
      throw new Error("VALIDATION_FAILED");
    }
    if (Array.isArray(body.items) && body.items.length > BATCH_RECORD_MAX_ITEMS) {
      throw new Error("VALIDATION_FAILED");
    }

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await this.assertSolopreneurOwner(client, context);

      const normalizedExplicitItems = body.items ? normalizeBatchItems(body.items) : undefined;
      const requestHash = isCommit
        ? createHash("sha256")
            .update(
              JSON.stringify({
                op: "drafts:record:commit",
                planHash: planHashInput,
                reason,
                requirePaymentEvidence,
                items: normalizedExplicitItems ?? "ALL_DRAFTS",
              }),
            )
            .digest("hex")
        : "";

      if (isCommit && idempotencyKey) {
        const replay = await this.lockReplay(
          client,
          context.organizationId,
          idempotencyKey,
          requestHash,
        );
        if (replay) {
          await client.query("rollback");
          return this.envelope(context, { ...replay, idempotencyReplayed: true });
        }
      }

      const targets =
        normalizedExplicitItems ??
        (await discoverOrganizationDrafts(client, context.organizationId));

      const { itemResults, computedPlanHash, succeeded, blocked, counts } =
        await evaluateBatchDraftItemsOnClient(client, context, targets, {
          isCommit,
          reason,
          requirePaymentEvidence,
        });

      if (!isCommit) {
        await client.query("rollback");
        return this.envelope(context, {
          dryRun: true,
          committed: false,
          planHash: computedPlanHash,
          reason,
          counts,
          succeeded,
          blocked,
          items: itemResults,
        });
      }

      if (computedPlanHash !== planHashInput) {
        await client.query("rollback");
        throw new Error("DRAFT_RECORD_PLAN_MISMATCH");
      }

      const auditEventId = randomUUID();
      const response = {
        dryRun: false,
        committed: true,
        planHash: computedPlanHash,
        reason,
        auditEventId,
        counts,
        succeeded,
        blocked,
        items: itemResults,
      };

      await client.query(
        `insert into resource_audit_events
           (organization_id, id, resource_type, resource_key, resource_version, action, actor_id, correlation_id, after_state)
         values ($1, $2, 'draft_batch_record', $3, 1, 'commit', $4, $5, $6)`,
        [
          context.organizationId,
          auditEventId,
          computedPlanHash,
          context.actorId,
          context.correlationId,
          { reason, counts },
        ],
      );
      await this.saveReplay(
        client,
        context.organizationId,
        idempotencyKey!,
        "drafts:record:commit",
        requestHash,
        response,
      );
      await client.query("commit");
      return this.envelope(context, { ...response, idempotencyReplayed: false });
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockReplay(
    client: PoolClient,
    organizationId: string,
    idempotencyKey: string,
    requestHash: string,
  ) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${organizationId}:${idempotencyKey}`,
    ]);
    const replay = await client.query<{
      request_hash: string;
      response_body: Record<string, unknown>;
    }>(
      `select request_hash, response_body from api_idempotency_records
        where organization_id = $1 and idempotency_key = $2
        for update`,
      [organizationId, idempotencyKey],
    );
    if (!replay.rows[0]) return undefined;
    if (replay.rows[0].request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
    return replay.rows[0].response_body;
  }

  private saveReplay(
    client: PoolClient,
    organizationId: string,
    idempotencyKey: string,
    operation: string,
    requestHash: string,
    response: unknown,
  ) {
    return client.query(
      `insert into api_idempotency_records
         (organization_id, idempotency_key, operation, request_hash, response_body)
       values ($1, $2, $3, $4, $5)`,
      [organizationId, idempotencyKey, operation, requestHash, response],
    );
  }
}
