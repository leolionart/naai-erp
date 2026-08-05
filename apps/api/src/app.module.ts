import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { MasterDataController } from "./master-data/master-data.controller.js";
import { MasterDataService } from "./master-data/master-data.service.js";
import { PgMasterDataStore } from "./master-data/pg-master-data.store.js";

@Module({
  controllers: [HealthController, MasterDataController],
  providers: [MasterDataService, PgMasterDataStore],
})
export class AppModule {}
