import { describe, expect, it } from 'vitest';
import { MODULES, assertAcyclic, moduleOrder, type ModuleName } from './boundaries';

describe('domain boundaries', () => {
  it('declares an acyclic dependency graph', () => {
    expect(() => assertAcyclic()).not.toThrow();
  });

  it('only depends on modules that exist', () => {
    for (const m of Object.values(MODULES)) {
      for (const dep of m.dependsOn) {
        expect(MODULES[dep]).toBeDefined();
      }
    }
  });

  it('orders dependencies before dependents', () => {
    const order = moduleOrder();
    const idx = (n: ModuleName) => order.indexOf(n);
    expect(idx('identity')).toBeLessThan(idx('marketplace'));
    expect(idx('marketplace')).toBeLessThan(idx('auction'));
    expect(idx('auction')).toBeLessThan(idx('commerce'));
    expect(order).toHaveLength(Object.keys(MODULES).length);
  });

  it('detects an introduced cycle', () => {
    const broken = structuredClone(MODULES);
    broken.identity.dependsOn = ['commerce'];
    expect(() => assertAcyclic(broken)).toThrow(/cycle/i);
  });
});
