import { Module } from "@nestjs/common";
import { MasterDataService } from "../master-data/master-data.service.js";
import { PgMasterDataStore } from "../master-data/pg-master-data.store.js";
import { CustomerServiceSubscriptionController } from "./customer-service-subscription.controller.js";
import { CustomerServiceSubscriptionService } from "./customer-service-subscription.service.js";
import { CUSTOMER_SUBSCRIPTION_STORE } from "./customer-service-subscription.types.js";
import { PgCustomerServiceSubscriptionStore } from "./pg-customer-service-subscription.store.js";
@Module({
  controllers: [CustomerServiceSubscriptionController],
  providers: [
    MasterDataService,
    PgMasterDataStore,
    CustomerServiceSubscriptionService,
    PgCustomerServiceSubscriptionStore,
    { provide: CUSTOMER_SUBSCRIPTION_STORE, useExisting: PgCustomerServiceSubscriptionStore },
  ],
  exports: [CustomerServiceSubscriptionService],
})
export class CustomerServiceSubscriptionModule {}
