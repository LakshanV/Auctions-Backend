import { describe, expect, it } from 'vitest';
import { summarizeAiEvaluation, type AiFeedbackRecord } from './evaluation';

describe('summarizeAiEvaluation (§8)', () => {
  it('returns zeroed rates for no feedback', () => {
    const s = summarizeAiEvaluation([]);
    expect(s.totalFeedback).toBe(0);
    expect(s.acceptanceRate).toBe(0);
    expect(s.byTaskType).toEqual([]);
  });

  it('computes overall + per-task rates and correction volume', () => {
    const records: AiFeedbackRecord[] = [
      { outcome: 'accepted', taskType: 'listing_draft' },
      { outcome: 'accepted', taskType: 'listing_draft' },
      { outcome: 'corrected', taskType: 'listing_draft', correctedFieldCount: 2 },
      { outcome: 'rejected', taskType: 'media_caption' },
      { outcome: 'corrected', taskType: 'media_caption', correctedFieldCount: 1 },
    ];
    const s = summarizeAiEvaluation(records);
    expect(s.totalFeedback).toBe(5);
    expect(s.byOutcome).toEqual({ accepted: 2, corrected: 2, rejected: 1 });
    expect(s.acceptanceRate).toBe(0.4);
    expect(s.correctionRate).toBe(0.4);
    expect(s.rejectionRate).toBe(0.2);
    expect(s.correctedFieldCount).toBe(3);

    const draft = s.byTaskType.find((t) => t.taskType === 'listing_draft')!;
    expect(draft.total).toBe(3);
    expect(draft.accepted).toBe(2);
    expect(draft.acceptanceRate).toBe(0.667);

    // Sorted by total desc — listing_draft (3) before media_caption (2).
    expect(s.byTaskType[0]?.taskType).toBe('listing_draft');
  });
});
