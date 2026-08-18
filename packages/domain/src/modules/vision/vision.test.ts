import { describe, expect, it } from 'vitest';
import {
  buildCaptureCoach,
  deriveFieldState,
  finalizeFields,
  hasUnmetRequiredCaptures,
  toVisionValuation,
  type RawObservation,
} from './vision';

describe('capture coach', () => {
  it('marks covered required views present and leaves the rest missing', () => {
    const coach = buildCaptureCoach('vehicles', ['front_quarter', 'odometer']);
    const byView = Object.fromEntries(coach.map((c) => [c.view, c]));
    expect(byView.front_quarter!.present).toBe(true);
    expect(byView.odometer!.present).toBe(true);
    expect(byView.vin_plate!.present).toBe(false);
    expect(byView.vin_plate!.required).toBe(true);
  });

  it('is case/space-insensitive on the view hint', () => {
    const coach = buildCaptureCoach('gems', [' Face_Up ', 'SCALE']);
    const byView = Object.fromEntries(coach.map((c) => [c.view, c]));
    expect(byView.face_up!.present).toBe(true);
    expect(byView.scale!.present).toBe(true);
  });

  it('reports unmet required captures until every required view is present', () => {
    const partial = buildCaptureCoach('gems', ['face_up']);
    expect(hasUnmetRequiredCaptures(partial)).toBe(true);
    const full = buildCaptureCoach('gems', ['face_up', 'scale', 'certificate']);
    expect(hasUnmetRequiredCaptures(full)).toBe(false);
  });

  it('falls back to the general plan for an unknown category', () => {
    // @ts-expect-error deliberately passing a non-category to prove the safe fallback
    const coach = buildCaptureCoach('spaceship', []);
    expect(coach.some((c) => c.view === 'main' && c.required)).toBe(true);
  });
});

describe('field state honesty', () => {
  it('never upgrades weak/absent signals to a confident claim', () => {
    expect(deriveFieldState(0.95, 'Toyota')).toBe('observed');
    expect(deriveFieldState(0.7, 'Toyota')).toBe('probable');
    expect(deriveFieldState(0.3, 'Toyota')).toBe('uncertain');
    expect(deriveFieldState(0.99, null)).toBe('not_visible');
    expect(deriveFieldState(0, 'x')).toBe('not_visible');
  });
});

describe('finalizeFields', () => {
  const obs = (over: Partial<RawObservation>): RawObservation => ({
    field: 'make',
    value: 'Toyota',
    confidence: 0.9,
    source: 'plate OCR',
    ...over,
  });

  it('clamps confidence and assigns honest states', () => {
    const out = finalizeFields([
      obs({ confidence: 1.4 }),
      obs({ field: 'colour', value: 'white', confidence: 0.4 }),
    ]);
    const make = out.find((f) => f.field === 'make')!;
    const colour = out.find((f) => f.field === 'colour')!;
    expect(make.confidence).toBe(1);
    expect(make.state).toBe('observed');
    expect(colour.state).toBe('uncertain');
  });

  it('dedups by field, keeping the highest-confidence observation', () => {
    const out = finalizeFields([
      obs({ field: 'model', value: 'Hilux', confidence: 0.5 }),
      obs({ field: 'model', value: 'Hilux', confidence: 0.88 }),
    ]);
    const model = out.filter((f) => f.field === 'model');
    expect(model).toHaveLength(1);
    expect(model[0]!.confidence).toBe(0.88);
    expect(model[0]!.state).toBe('observed');
  });

  it('flags a confident observation that contradicts the seller claim (never silently overwrites)', () => {
    const out = finalizeFields([obs({ field: 'make', value: 'Toyota', confidence: 0.92 })], {
      make: 'Nissan',
    });
    const make = out.find((f) => f.field === 'make')!;
    expect(make.state).toBe('contradicted');
    expect(make.value).toBe('Toyota'); // observation preserved; human resolves
    expect(make.source).toMatch(/Nissan/);
  });

  it('does not flag when the seller claim agrees (numeric-tolerant)', () => {
    const out = finalizeFields([obs({ field: 'year', value: 2015, confidence: 0.8 })], {
      year: '2015',
    });
    expect(out.find((f) => f.field === 'year')!.state).toBe('probable');
  });

  it('returns a stable field-sorted order', () => {
    const out = finalizeFields([
      obs({ field: 'model' }),
      obs({ field: 'make' }),
      obs({ field: 'colour', value: 'white' }),
    ]);
    expect(out.map((f) => f.field)).toEqual(['colour', 'make', 'model']);
  });
});

describe('toVisionValuation', () => {
  const base = {
    currency: 'LKR',
    range: { minMinor: 100_000, medianMinor: 150_000, maxMinor: 200_000 },
    comparableCount: 5,
    comparableRefs: ['SNG-1', 'SNG-2'],
    factors: ['recent sales'],
    evidenceComplete: true,
    assessedAt: '2026-08-17T00:00:00.000Z',
  };

  it('builds an evidence-based band straight from the comparables range', () => {
    const v = toVisionValuation(base)!;
    expect(v.lowMinor).toBe(100_000);
    expect(v.expectedMinor).toBe(150_000);
    expect(v.highMinor).toBe(200_000);
    expect(v.comparableRefs).toEqual(['SNG-1', 'SNG-2']);
    expect(v.confidence).toBeGreaterThan(0);
    expect(v.confidence).toBeLessThanOrEqual(1);
  });

  it('returns undefined with no comparables rather than inventing a number', () => {
    expect(toVisionValuation({ ...base, range: null, comparableCount: 0 })).toBeUndefined();
  });

  it('lowers confidence and annotates when required evidence is incomplete', () => {
    const complete = toVisionValuation(base)!;
    const incomplete = toVisionValuation({ ...base, evidenceComplete: false })!;
    expect(incomplete.confidence).toBeLessThan(complete.confidence);
    expect(incomplete.factors.some((f) => /incomplete/i.test(f))).toBe(true);
  });
});
