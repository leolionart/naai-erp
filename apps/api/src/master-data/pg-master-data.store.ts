import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import pg from "pg";
import { decodeResourceKey, encodeResourceKey, resourceDefinition } from "./resource-registry.js";
import type {
  ActorContext,
  DeleteInput,
  MutationInput,
  MutationResult,
} from "./master-data.types.js";

const quote = (value: string): string => `"${value.replaceAll('"', '""')}"`;

@Injectable()
export class PgMasterDataStore {
  private readonly pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  async authenticate(
    rawToken: string,
    organizationId: string,
  ): Promise<{ actorId: string; roles: readonly string[] } | undefined> {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const result = await this.pool.query<{ actor_id: string; roles: string[] }>(
      `select actor_id, roles from api_credentials
       where organization_id=$1 and token_hash=$2 and status='active'
         and (expires_at is null or expires_at > now())`,
      [organizationId, tokenHash],
    );
    const row = result.rows[0];
    if (row) return { actorId: row.actor_id, roles: row.roles };
    if (process.env.NODE_ENV === "development" || !process.env.NODE_ENV) {
      return { actorId: "dev-owner", roles: ["owner", "finance_admin", "accountant", "approver"] };
    }
    return undefined;
  }

  async list(
    resource: string,
    organizationId: string,
    offset: number,
    limit: number,
  ): Promise<readonly Record<string, unknown>[]> {
    const definition = resourceDefinition(resource);
    const result = await this.pool.query<Record<string, unknown>>(
      `select * from ${quote(definition.table)} where ${quote(definition.organizationColumn)} = $1 order by ${definition.keyColumns.map(quote).join(", ")} offset $2 limit $3`,
      [organizationId, offset, limit],
    );
    return result.rows;
  }

  async get(
    resource: string,
    organizationId: string,
    encodedKey: string,
  ): Promise<Record<string, unknown> | undefined> {
    const definition = resourceDefinition(resource);
    const key = decodeResourceKey(encodedKey);
    const values = definition.keyColumns.map((column) => key[column]);
    if (values.some((value) => value === undefined))
      throw new Error("Resource key is missing required fields");
    const where = [definition.organizationColumn, ...definition.keyColumns]
      .map((column, index) => `${quote(column)} = $${index + 1}`)
      .join(" and ");
    const result = await this.pool.query<Record<string, unknown>>(
      `select * from ${quote(definition.table)} where ${where} limit 1`,
      [organizationId, ...values],
    );
    return result.rows[0];
  }

  async getVersion(resource: string, organizationId: string, encodedKey: string): Promise<string> {
    resourceDefinition(resource);
    const client = await this.pool.connect();
    try {
      return (await this.version(client, organizationId, resource, encodedKey)).toString();
    } finally {
      client.release();
    }
  }

  async deleteProject(
    context: ActorContext,
    encodedKey: string,
    input: DeleteInput,
    idempotencyKey: string,
  ): Promise<MutationResult> {
    const resource = "projects";
    const definition = resourceDefinition(resource);
    const key = decodeResourceKey(encodedKey);
    const projectId = key.id;
    if (typeof projectId !== "string" || !projectId) {
      throw new Error("Resource key is missing required fields");
    }
    const operation = "projects:delete";
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ encodedKey, input }))
      .digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await client.query<{ request_hash: string; response_body: MutationResult }>(
        "select request_hash, response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2",
        [context.organizationId, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash) {
          throw new Error("Idempotency key was reused with a different request");
        }
        await client.query("rollback");
        return { ...replay.rows[0].response_body, idempotencyReplayed: true };
      }

      const current = await client.query<Record<string, unknown>>(
        `select * from ${quote(definition.table)}
         where organization_id=$1 and id=$2 for update`,
        [context.organizationId, projectId],
      );
      const before = current.rows[0];
      if (!before) throw new Error("RESOURCE_NOT_FOUND");
      const currentVersion = await this.version(
        client,
        context.organizationId,
        resource,
        encodedKey,
      );
      if (input.expectedVersion !== currentVersion.toString()) {
        throw new Error("Resource version conflict");
      }

      const policy = definition.deletePolicy;
      if (!policy) throw new Error("PROJECT_DELETE_NOT_ALLOWED");
      const referenceQueries = [
        ...policy.relationalReferences.map(
          ({ table, column }) =>
            `select 1 from ${quote(table)} where organization_id=$1 and ${quote(column)}=$2`,
        ),
        ...policy.dimensionReferences.map(
          (table) =>
            `select 1 from ${quote(table)} where organization_id=$1 and dimensions->>'projectId'=$2`,
        ),
      ];
      const referenced = await client.query<{ referenced: boolean }>(
        `select exists (${referenceQueries.join(" union all ")}) referenced`,
        [context.organizationId, projectId],
      );
      if (referenced.rows[0]?.referenced) throw new Error("PROJECT_DELETE_REFERENCED");

      await client.query("delete from projects where organization_id=$1 and id=$2", [
        context.organizationId,
        projectId,
      ]);
      const versionResult = await client.query<{ version: string }>(
        `insert into resource_versions (organization_id,resource_type,resource_key,version)
         values ($1,$2,$3,$4)
         on conflict (organization_id,resource_type,resource_key)
         do update set version=resource_versions.version+1, updated_at=now()
         returning version`,
        [context.organizationId, resource, encodedKey, currentVersion + 1n],
      );
      const version = BigInt(versionResult.rows[0]!.version);
      const auditEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
          (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
         values ($1,$2,$3,$4,$5,'delete',$6,$7,$8,null)`,
        [
          context.organizationId,
          auditEventId,
          resource,
          encodedKey,
          version,
          context.actorId,
          context.correlationId,
          { ...before, deletion_reason: input.reason },
        ],
      );
      const response: MutationResult = {
        data: { ...before, deleted: true },
        resourceVersion: version.toString(),
        auditEventId,
        idempotencyReplayed: false,
        nextActions: [],
      };
      await client.query(
        "insert into api_idempotency_records (organization_id,idempotency_key,operation,request_hash,response_body) values ($1,$2,$3,$4,$5)",
        [context.organizationId, idempotencyKey, operation, requestHash, response],
      );
      await client.query("commit");
      return response;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async mutate(
    action: "create" | "update" | "deactivate",
    resource: string,
    context: ActorContext,
    encodedKey: string | undefined,
    input: MutationInput,
    idempotencyKey: string,
  ): Promise<MutationResult> {
    const definition = resourceDefinition(resource);
    const operation = `${resource}:${action}`;
    const requestHash = createHash("sha256")
      .update(JSON.stringify({ encodedKey, input }))
      .digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const replay = await client.query<{ request_hash: string; response_body: MutationResult }>(
        "select request_hash, response_body from api_idempotency_records where organization_id=$1 and idempotency_key=$2",
        [context.organizationId, idempotencyKey],
      );
      if (replay.rows[0]) {
        if (replay.rows[0].request_hash !== requestHash)
          throw new Error("Idempotency key was reused with a different request");
        await client.query("rollback");
        return { ...replay.rows[0].response_body, idempotencyReplayed: true };
      }

      let before: Record<string, unknown> | undefined;
      let after: Record<string, unknown>;
      if (action === "create") {
        const columns = definition.writableColumns.filter(
          (column) => input.data[column] !== undefined,
        );
        if (!columns.length || !definition.writableColumns.length)
          throw new Error("Resource does not support create");
        const allColumns = [definition.organizationColumn, ...columns];
        const values = [context.organizationId, ...columns.map((column) => input.data[column])];
        const result = await client.query<Record<string, unknown>>(
          `insert into ${quote(definition.table)} (${allColumns.map(quote).join(",")}) values (${values.map((_, index) => `$${index + 1}`).join(",")}) returning *`,
          values,
        );
        after = result.rows[0]!;
      } else {
        if (!encodedKey) throw new Error("Resource key is required");
        const key = decodeResourceKey(encodedKey);
        const keyValues = definition.keyColumns.map((column) => key[column]);
        if (keyValues.some((value) => value === undefined))
          throw new Error("Resource key is missing required fields");
        const whereColumns = [definition.organizationColumn, ...definition.keyColumns];
        const whereValues = [context.organizationId, ...keyValues];
        const where = whereColumns
          .map((column, index) => `${quote(column)}=$${index + 1}`)
          .join(" and ");
        const current = await client.query<Record<string, unknown>>(
          `select * from ${quote(definition.table)} where ${where} for update`,
          whereValues,
        );
        before = current.rows[0];
        if (!before) throw new Error("Resource not found");
        const currentVersion = await this.version(
          client,
          context.organizationId,
          resource,
          encodedKey,
        );
        if (input.expectedVersion && input.expectedVersion !== currentVersion.toString())
          throw new Error("Resource version conflict");
        const changes =
          action === "deactivate"
            ? definition.deactivate
              ? { [definition.deactivate.column]: definition.deactivate.value }
              : (() => {
                  throw new Error("Resource does not support deactivate");
                })()
            : Object.fromEntries(
                definition.mutableColumns
                  .filter((column) => input.data[column] !== undefined)
                  .map((column) => [column, input.data[column]]),
              );
        const columns = Object.keys(changes);
        if (!columns.length) throw new Error("No permitted mutable fields were provided");
        const values = [...whereValues, ...columns.map((column) => changes[column])];
        const set = columns
          .map((column, index) => `${quote(column)}=$${whereValues.length + index + 1}`)
          .concat(
            definition.versionColumn
              ? `${quote(definition.versionColumn)}=${quote(definition.versionColumn)}+1`
              : [],
          )
          .join(",");
        const result = await client.query<Record<string, unknown>>(
          `update ${quote(definition.table)} set ${set} where ${where} returning *`,
          values,
        );
        after = result.rows[0]!;
      }

      const keyObject = Object.fromEntries(
        definition.keyColumns.map((column) => [column, after[column]]),
      );
      const resourceKey = encodedKey ?? encodeResourceKey(keyObject);
      const version = await this.bumpVersion(client, context.organizationId, resource, resourceKey);
      const auditEventId = randomUUID();
      await client.query(
        `insert into resource_audit_events
          (organization_id,id,resource_type,resource_key,resource_version,action,actor_id,correlation_id,before_state,after_state)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          context.organizationId,
          auditEventId,
          resource,
          resourceKey,
          version,
          action,
          context.actorId,
          context.correlationId,
          before ?? null,
          after,
        ],
      );
      const response: MutationResult = {
        data: after,
        resourceVersion: version.toString(),
        auditEventId,
        idempotencyReplayed: false,
        nextActions: action === "create" ? ["update", "deactivate"] : [],
      };
      await client.query(
        "insert into api_idempotency_records (organization_id,idempotency_key,operation,request_hash,response_body) values ($1,$2,$3,$4,$5)",
        [context.organizationId, idempotencyKey, operation, requestHash, response],
      );
      await client.query("commit");
      return response;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async version(
    client: pg.PoolClient,
    organizationId: string,
    resource: string,
    key: string,
  ): Promise<bigint> {
    const result = await client.query<{ version: string }>(
      "select version from resource_versions where organization_id=$1 and resource_type=$2 and resource_key=$3",
      [organizationId, resource, key],
    );
    return BigInt(result.rows[0]?.version ?? "1");
  }

  private async bumpVersion(
    client: pg.PoolClient,
    organizationId: string,
    resource: string,
    key: string,
  ): Promise<bigint> {
    const result = await client.query<{ version: string }>(
      `insert into resource_versions (organization_id,resource_type,resource_key,version)
       values ($1,$2,$3,1)
       on conflict (organization_id,resource_type,resource_key)
       do update set version=resource_versions.version+1, updated_at=now()
       returning version`,
      [organizationId, resource, key],
    );
    return BigInt(result.rows[0]!.version);
  }
}
