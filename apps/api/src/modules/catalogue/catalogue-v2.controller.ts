import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  type CatalogueQuery,
  type CatalogueRowQuery,
  catalogueQuerySchema,
  catalogueRowQuerySchema,
} from '@singha/contracts';
import { CatalogueV2Service } from './catalogue-v2.service';
import { ZodQuery } from '../../shared/validation/zod.pipe';

/**
 * Enriched public catalogue (consolidated pack doc 07). Mounted at the absolute
 * path `api/v2/catalogue` (excluded from the global `api/v1` prefix) so v1 stays
 * compatible while v2 offers richer, paginated, faceted semantics.
 */
@Controller('api/v2/catalogue')
export class CatalogueV2Controller {
  constructor(private readonly catalogue: CatalogueV2Service) {}

  @Get()
  list(@Query(new ZodQuery(catalogueQuerySchema)) query: CatalogueQuery) {
    return this.catalogue.list(query);
  }

  /**
   * One AuctionFlow/Rubik category row with its own cursor (pack 01 doc 05).
   * Declared before `:id` so the static `row` segment is never parsed as a lot id.
   */
  @Get('row')
  row(@Query(new ZodQuery(catalogueRowQuerySchema)) query: CatalogueRowQuery) {
    return this.catalogue.row(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.catalogue.get(id);
  }
}
