/**
 * §8 — AI correction/evaluation loop aggregation. Pure: turns the append-only human-feedback
 * records (accepted / corrected / rejected on an AI run) into deterministic accuracy metrics. This
 * is the evaluation half of the loop — the labelled signal that tells us how often the AI's derived
 * output is taken as-is, edited, or thrown away, overall and per task type. No model, no side
 * effects; safe to compute on demand.
 */

export type AiFeedbackOutcome = 'accepted' | 'corrected' | 'rejected';

export interface AiFeedbackRecord {
  outcome: AiFeedbackOutcome;
  /** The AI task the feedback is about (e.g. 'listing_draft', 'media_caption', 'quality_check'). */
  taskType: string;
  /** How many fields the human corrected on this run (0 when accepted/rejected). */
  correctedFieldCount?: number;
}

export interface AiOutcomeCounts {
  accepted: number;
  corrected: number;
  rejected: number;
}

export interface AiEvaluationByTask extends AiOutcomeCounts {
  taskType: string;
  total: number;
  /** accepted / total, rounded to 3 dp. */
  acceptanceRate: number;
}

export interface AiEvaluationSummary {
  totalFeedback: number;
  byOutcome: AiOutcomeCounts;
  /** accepted / total (0 when no feedback). Rounded to 3 dp. */
  acceptanceRate: number;
  /** corrected / total. */
  correctionRate: number;
  /** rejected / total. */
  rejectionRate: number;
  /** Total individual fields corrected across all runs — the raw correction volume. */
  correctedFieldCount: number;
  byTaskType: AiEvaluationByTask[];
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const rate = (num: number, den: number): number => (den === 0 ? 0 : round3(num / den));

/** Aggregate feedback records into an evaluation summary (overall + per task type). */
export function summarizeAiEvaluation(records: AiFeedbackRecord[]): AiEvaluationSummary {
  const overall: AiOutcomeCounts = { accepted: 0, corrected: 0, rejected: 0 };
  const byTask = new Map<string, AiOutcomeCounts>();
  let correctedFieldCount = 0;

  for (const r of records) {
    overall[r.outcome] += 1;
    correctedFieldCount += r.correctedFieldCount ?? 0;
    const t = byTask.get(r.taskType) ?? { accepted: 0, corrected: 0, rejected: 0 };
    t[r.outcome] += 1;
    byTask.set(r.taskType, t);
  }

  const total = records.length;
  const byTaskType: AiEvaluationByTask[] = [...byTask.entries()]
    .map(([taskType, c]) => {
      const t = c.accepted + c.corrected + c.rejected;
      return {
        taskType,
        ...c,
        total: t,
        acceptanceRate: rate(c.accepted, t),
      };
    })
    .sort((a, b) => b.total - a.total || a.taskType.localeCompare(b.taskType));

  return {
    totalFeedback: total,
    byOutcome: overall,
    acceptanceRate: rate(overall.accepted, total),
    correctionRate: rate(overall.corrected, total),
    rejectionRate: rate(overall.rejected, total),
    correctedFieldCount,
    byTaskType,
  };
}
