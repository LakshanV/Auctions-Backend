import { Controller, Get, Param, Query } from '@nestjs/common';
import { catalogueQuerySchema } from '@singha/contracts';
import { CatalogueV2Service } from './catalogue-v2.service';

/**
 * Enriched public catalogue (consolidated pack doc 07). Mounted at the absolute
 * path `api/v2/catalogue` (excluded from the global `api/v1` prefix) so v1 stays
 * compatible while v2 offers richer, paginated, faceted semantics.
 */
@Controller('api/v2/catalogue')
export class CatalogueV2Controller {
  constructor(private readonly catalogue: CatalogueV2Service) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.catalogue.list(catalogueQuerySchema.parse(query));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.catalogue.get(id);
  }
}
