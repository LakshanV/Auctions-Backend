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
