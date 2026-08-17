import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { catalogueQuerySchema } from '@singha/contracts';
import { ZodBody, ZodQuery } from './zod.pipe';

const meta = { type: 'query', metatype: undefined, data: undefined } as const;

describe('ZodQuery', () => {
  const pipe = new ZodQuery(catalogueQuerySchema);

  it('coerces + returns a valid catalogue query (defaults applied)', () => {
    const out = pipe.transform({ category: 'vehicles', limit: '24' }, meta as never);
    expect(out.category).toBe('vehicles');
    expect(out.limit).toBe(24); // z.coerce.number applied
    expect(out.page).toBe(1); // schema default
    expect(out.sort).toBe('ending'); // schema default
  });

  it('accepts limit at the page-size ceiling (60)', () => {
    expect(pipe.transform({ limit: '60' }, meta as never).limit).toBe(60);
  });

  // Regression: an oversize `limit` (or any invalid query param) must surface as a clean 400,
  // never leak as an unhandled ZodError 500 the way an inline `schema.parse(query)` in the
  // controller did. This is also the anti-clone page-size boundary.
  it('rejects limit above the ceiling with a 400, not a thrown ZodError', () => {
    expect(() => pipe.transform({ limit: '61' }, meta as never)).toThrow(BadRequestException);
  });

  it('rejects a hostile bulk-scrape limit (?limit=100000) with a 400', () => {
    expect(() => pipe.transform({ limit: '100000' }, meta as never)).toThrow(BadRequestException);
  });

  it('rejects an out-of-enum filter value with a 400', () => {
    expect(() => pipe.transform({ saleMethod: 'NOT_A_METHOD' }, meta as never)).toThrow(
      BadRequestException,
    );
  });

  it('names the offending field in the 400 message', () => {
    try {
      pipe.transform({ limit: '100000' }, meta as never);
      throw new Error('expected a BadRequestException');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect(JSON.stringify((e as BadRequestException).getResponse())).toContain('limit');
    }
  });
});

describe('ZodBody', () => {
  const schema = z.object({ name: z.string().min(1) });
  const pipe = new ZodBody(schema);

  it('returns validated data on success', () => {
    expect(pipe.transform({ name: 'ok' }, meta as never)).toEqual({ name: 'ok' });
  });

  it('throws a 400 on failure', () => {
    expect(() => pipe.transform({ name: '' }, meta as never)).toThrow(BadRequestException);
  });
});
