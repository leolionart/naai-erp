import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION, type CreateCustomerReceiptRequest } from "@naai-erp/contracts";
import { validateCustomerReceipt } from "@naai-erp/domain";
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  CUSTOMER_RECEIPT_STORE,
  type CustomerReceiptContext,
  type CustomerReceiptStore,
} from "./customer-receipt.types.js";
@Injectable()
export class CustomerReceiptService {
  constructor(
    @Inject(CUSTOMER_RECEIPT_STORE) private readonly store: CustomerReceiptStore,
    @Inject(MasterDataService) private readonly master: MasterDataService,
  ) {}
  authenticate(auth: string | undefined, org: string, corr: string) {
    return this.master.authenticate(auth, org, corr);
  }
  private envelope(c: CustomerReceiptContext, data: unknown) {
    return {
      apiVersion: API_VERSION,
      requestId: c.correlationId,
      organizationId: c.organizationId,
      data,
    };
  }
  async create(c: CustomerReceiptContext, input: CreateCustomerReceiptRequest, key?: string) {
    if (!c.roles.some((r) => ["owner", "finance_admin", "accountant"].includes(r)))
      throw new Error("FORBIDDEN");
    if (!key) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    if (
      input.schemaVersion !== 1 ||
      !input.financialAccountId?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.receiptDate) ||
      !/^[A-Z]{3}$/.test(input.currency) ||
      !input.description?.trim() ||
      !input.reason?.trim()
    )
      throw new Error("VALIDATION_FAILED");
    validateCustomerReceipt(input);
    return this.envelope(c, await this.store.create(c, input, key));
  }
  async list(c: CustomerReceiptContext) {
    return this.envelope(c, await this.store.list(c.organizationId));
  }
  async get(c: CustomerReceiptContext, id: string) {
    const x = await this.store.get(c.organizationId, id);
    if (!x) throw new Error("RESOURCE_NOT_FOUND");
    return this.envelope(c, x);
  }
}
