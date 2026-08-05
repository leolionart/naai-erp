import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { MasterDataController } from "./master-data/master-data.controller.js";
import { MasterDataService } from "./master-data/master-data.service.js";
import { PgMasterDataStore } from "./master-data/pg-master-data.store.js";
import { JournalController } from "./journals/journal.controller.js";
import { JournalService } from "./journals/journal.service.js";
import { PgJournalStore } from "./journals/pg-journal.store.js";

@Module({
  controllers: [HealthController, MasterDataController, JournalController],
  providers: [MasterDataService, PgMasterDataStore, JournalService, PgJournalStore],
})
export class AppModule {}
