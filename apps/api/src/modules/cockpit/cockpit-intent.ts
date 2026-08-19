/**
 * Deterministic cockpit-question classifier (unified-identity pass). Maps a client's plain-language
 * question to ONE authoritative fact-slice. Deterministic on purpose: the AI layer only INTERPRETS
 * intent — it never generates the numbers (rules 3/11), so there is nothing to hallucinate. Swapping
 * in a model later means replacing only this function; the fact resolution stays authoritative.
 */
export type CockpitIntent =
  'attention' | 'bid_capacity' | 'winning' | 'amounts_owed' | 'seller_proceeds' | 'purchases';

const RULES: Array<{ intent: CockpitIntent; any: RegExp[] }> = [
  {
    intent: 'bid_capacity',
    any: [/how much (can|could) i bid/, /bid capacity/, /can i bid/, /bidding power/, /my limit/],
  },
  {
    intent: 'seller_proceeds',
    any: [/seller proceeds/, /proceeds/, /what am i owed/, /my payout/, /settlement/, /get paid/],
  },
  {
    intent: 'amounts_owed',
    any: [
      /what.*(do|money).*i owe/,
      /how much.*i owe/,
      /owe/,
      /pay/,
      /amounts? to pay/,
      /invoice/,
      /balance/,
    ],
  },
  {
    intent: 'winning',
    any: [/what am i winning/, /am i winning/, /winning/, /top bidder/, /leading/, /outbid/],
  },
  {
    intent: 'purchases',
    any: [
      /where are my purchases/,
      /my purchases/,
      /what did i buy/,
      /bought/,
      /won lots?/,
      /pickup/,
    ],
  },
  {
    intent: 'attention',
    any: [
      /needs? my attention/,
      /what.*attention/,
      /what.*urgent/,
      /to.?do/,
      /action/,
      /what.*next/,
    ],
  },
];

export function classifyCockpitQuestion(question: string): CockpitIntent {
  const q = question.toLowerCase();
  for (const rule of RULES) {
    if (rule.any.some((re) => re.test(q))) return rule.intent;
  }
  // A general "how are things / summary" question defaults to the attention digest.
  return 'attention';
}
