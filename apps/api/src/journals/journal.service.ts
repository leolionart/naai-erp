import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
import { MasterDataService } from "../master-data/master-data.service.js";
import { PgJournalStore } from "./pg-journal.store.js";
import type { CreateJournalInput, JournalActorContext } from "./journal.types.js";

const WRITE_ROLES = new Set(["owner", "finance_admin", "accountant", "integration"]);
const POST_ROLES = new Set(["owner", "finance_admin", "accountant"]);

@Injectable()
export class JournalService {
  constructor(
    @Inject(PgJournalStore) private readonly store: PgJournalStore,
    @Inject(MasterDataService) private readonly masterData: MasterDataService,
  ) {}

  async authenticate(
    authorization: string | undefined,
    organizationId: string,
    correlationId: string,
  ): Promise<JournalActorContext> {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }

  private envelope(context: JournalActorContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data,
    };
  }

  async list(context: JournalActorContext) {
    return this.envelope(context, { items: await this.store.list(context.organizationId) });
  }
  async get(context: JournalActorContext, id: string) {
    const journal = await this.store.get(context.organizationId, id);
    if (!journal) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(context, journal);
  }
  async create(context: JournalActorContext, input: CreateJournalInput, idempotencyKey?: string) {
    if (!context.roles.some((role) => WRITE_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (
      !input.lines?.length ||
      !input.description?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.journalDate) ||
      !/^[A-Z]{3}$/.test(input.currency) ||
      input.lines.some((line) => {
        try {
          const debit = line.debitMinor === undefined ? undefined : BigInt(line.debitMinor);
          const credit = line.creditMinor === undefined ? undefined : BigInt(line.creditMinor);
          return (debit === undefined) === (credit === undefined) || (debit ?? credit ?? 0n) <= 0n;
        } catch {
          return true;
        }
      })
    )
      throw new Error("VALIDATION_FAILED");
    return this.envelope(context, await this.store.create(context, input, idempotencyKey));
  }
  async post(context: JournalActorContext, id: string, idempotencyKey?: string) {
    if (!context.roles.some((role) => POST_ROLES.has(role))) throw new Error("FORBIDDEN");
    if (!idempotencyKey) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    return this.envelope(context, await this.store.post(context, id, idempotencyKey));
  }
}
