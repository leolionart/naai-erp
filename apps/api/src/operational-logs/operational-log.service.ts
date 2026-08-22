import { Inject, Injectable } from "@nestjs/common";
import { API_VERSION } from "@naai-erp/contracts";
// Runtime class token is required by Nest constructor injection.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MasterDataService } from "../master-data/master-data.service.js";
import {
  OPERATIONAL_LOG_STORE,
  type OperationalLogContext,
  type OperationalLogFilters,
  type OperationalLogStore,
} from "./operational-log.types.js";
const READ_ROLES = new Set(["owner", "finance_admin", "accountant", "approver", "viewer"]);
@Injectable()
export class OperationalLogService {
  constructor(
    @Inject(OPERATIONAL_LOG_STORE) private readonly store: OperationalLogStore,
    private readonly masterData: MasterDataService,
  ) {}
  authenticate(authorization: string | undefined, organizationId: string, correlationId: string) {
    return this.masterData.authenticate(authorization, organizationId, correlationId);
  }
  async list(context: OperationalLogContext, filters: OperationalLogFilters) {
    if (!context.roles.some((role) => READ_ROLES.has(role))) throw new Error("FORBIDDEN");
    return {
      apiVersion: API_VERSION,
      requestId: context.correlationId,
      organizationId: context.organizationId,
      data: await this.store.list(context.organizationId, filters),
    };
  }
}
