import { describe, expect, it } from 'vitest';
import { MockInspectionProvider } from './inspection.provider';

describe('MockInspectionProvider', () => {
  const insp = new MockInspectionProvider();

  it('records a request with a reproducible id and never fabricates a certificate', async () => {
    const a = await insp.requestInspection({ subjectRef: 'asset_1', kind: 'gem_certification' });
    const b = await insp.requestInspection({ subjectRef: 'asset_1', kind: 'gem_certification' });
    expect(a.status).toBe('requested');
    expect(a.provider).toBe('mock');
    expect(a.kind).toBe('gem_certification');
    expect(a.certificateRef).toBeUndefined(); // honest — no invented certificate
    expect(a.inspectionId).toMatch(/^mock-insp-/);
    expect(a.inspectionId).toBe(b.inspectionId); // deterministic
  });

  it('has nothing to report until a real lab returns a result', async () => {
    const r = await insp.fetchResult('mock-insp-anything');
    expect(r).toBeNull();
  });

  it('derives distinct ids per subject/kind', async () => {
    const a = await insp.requestInspection({ subjectRef: 'asset_1', kind: 'gem_certification' });
    const c = await insp.requestInspection({ subjectRef: 'asset_2', kind: 'machinery_inspection' });
    expect(a.inspectionId).not.toBe(c.inspectionId);
  });
});
