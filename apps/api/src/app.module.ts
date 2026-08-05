import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { MasterDataController } from "./master-data/master-data.controller.js";
import { MasterDataService } from "./master-data/master-data.service.js";
import { PgMasterDataStore } from "./master-data/pg-master-data.store.js";
import { JournalController } from "./journals/journal.controller.js";
import { JournalService } from "./journals/journal.service.js";
import { PgJournalStore } from "./journals/pg-journal.store.js";
import { PostingRuleController } from "./posting-rules/posting-rule.controller.js";
import { PostingRuleService } from "./posting-rules/posting-rule.service.js";

@Module({
  controllers: [HealthController, MasterDataController, JournalController, PostingRuleController],
  providers: [
    MasterDataService,
    PgMasterDataStore,
    JournalService,
    PgJournalStore,
    PostingRuleService,
  ],
})
export class AppModule {}
