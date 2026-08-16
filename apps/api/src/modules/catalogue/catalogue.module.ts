import { Module } from '@nestjs/common';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';
import { CatalogueV2Controller } from './catalogue-v2.controller';
import { CatalogueV2Service } from './catalogue-v2.service';

@Module({
  controllers: [CatalogueController, CatalogueV2Controller],
  providers: [CatalogueService, CatalogueV2Service],
  // CatalogueV2Service.get() is the sanctioned, privacy-filtered single source of listing
  // context for other modules (e.g. the AIC-1 assistant) — never query Listing directly.
  exports: [CatalogueV2Service],
})
export class CatalogueModule {}
