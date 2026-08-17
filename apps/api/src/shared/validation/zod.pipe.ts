import { type ArgumentMetadata, BadRequestException, type PipeTransform } from '@nestjs/common';
import { z, type ZodTypeAny } from 'zod';

/**
 * Validates a request body against a Zod schema (docs/16 typed DTOs). Usage:
 * `@Body(new ZodBody(createAssetSchema)) input: CreateAssetInput`.
 */
export class ZodBody<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown, _metadata: ArgumentMetadata): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`),
      );
    }
    return result.data;
  }
}

/**
 * Validates request query params against a Zod schema — the `@Query()` counterpart of
 * `ZodBody`. Usage: `@Query(new ZodQuery(catalogueQuerySchema)) query: CatalogueQuery`.
 *
 * Query params are attacker-controllable free text (an oversize `limit`, a bad enum, a
 * non-numeric `page`), so a schema rejection must surface as a clean 400 — never leak as an
 * unhandled `ZodError` 500 the way an inline `schema.parse(query)` in a controller does. This
 * also makes the catalogue page-size ceiling (`limit.max`) a hard 400 boundary, so a hostile
 * `?limit=100000` bulk-scrape attempt is refused rather than served or crashed (anti-clone).
 */
export class ZodQuery<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown, _metadata: ArgumentMetadata): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((i) => `${i.path.join('.') || '(query)'}: ${i.message}`),
      );
    }
    return result.data;
  }
}
