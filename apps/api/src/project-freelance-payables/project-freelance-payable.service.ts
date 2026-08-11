import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION, type RecordFreelancePayablePaymentRequest } from "@naai-erp/contracts";
import { validateFreelancePayment } from "@naai-erp/domain";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  PROJECT_FREELANCE_PAYABLE_STORE,
  type ProjectFreelancePayableContext,
  type ProjectFreelancePayableStore,
} from "./project-freelance-payable.types.js";
@Injectable()
export class ProjectFreelancePayableService {
  constructor(
    @Inject(PROJECT_FREELANCE_PAYABLE_STORE) private readonly store: ProjectFreelancePayableStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(a: string | undefined, o: string, c: string) {
    return this.master.authenticate(a, o, c);
  }
  private envelope(c: ProjectFreelancePayableContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: c.correlationId,
      organizationId: c.organizationId,
      data,
    };
  }
  async list(
    c: ProjectFreelancePayableContext,
    f: { projectId?: string; freelancerPartyId?: string; state?: string },
  ) {
    return this.envelope(c, await this.store.list(c.organizationId, f));
  }
  async get(c: ProjectFreelancePayableContext, id: string) {
    const x = await this.store.get(c.organizationId, id);
    if (!x) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(c, x);
  }
  async pay(
    c: ProjectFreelancePayableContext,
    id: string,
    input: RecordFreelancePayablePaymentRequest,
    key?: string,
  ) {
    if (!c.roles.some((r) => ["owner", "finance_admin", "accountant"].includes(r)))
      throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (
      input.schemaVersion !== 1 ||
      !input.financialAccountId?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate) ||
      !input.reason?.trim()
    )
      throw new Error("VALIDATION_FAILED");
    validateFreelancePayment(input.amountMinor, BigInt(input.amountMinor));
    return this.envelope(c, await this.store.pay(c, id, input, key));
  }
}
