import { Controller, Get, Param } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';

/** Public catalogue — no auth required (privacy-safe fields only). */
@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Get()
  list() {
    return this.catalogue.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.catalogue.get(id);
  }
}
