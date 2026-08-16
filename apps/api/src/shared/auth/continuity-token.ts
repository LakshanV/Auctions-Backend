/**
 * AIC-2 — cross-channel continuity token (docs/09 "one customer identity and conversation
 * history across channels"). Encodes the ORIGIN conversation a customer wants to continue on
 * another channel: `{ conversationId, customerId }`.
 *
 * This is a LINK, not an auth credential (constraint 2 of the AIC-2 task pack) — it carries no
 * authority by itself and is deliberately NOT signed with a shared secret. Every use is
 * re-verified server-side against the exact same rule `ConnectService.inbound` already applies
 * to every ordinary inbound message: only a `verifiedAt`-stamped `ExternalIdentity` resolves a
 * customer, and the attach only proceeds if that freshly re-resolved customer matches the
 * origin conversation's own stored `customerId` (see `ConnectService`'s continuation branch).
 *
 * Why no signature: a forged/tampered token can claim ANY `{conversationId, customerId}` pair
 * it likes, but that buys an attacker nothing — the attach still only succeeds if the CALLER's
 * own freshly-verified identity resolves to that exact `customerId`, and a verified
 * `ExternalIdentity` can never be forged this way (it is looked up server-side by the caller's
 * OWN channel/externalUserId, not by anything the token says). So the token only ever needs to
 * be opaque + structurally valid, not cryptographically authentic — see DECISIONS.md.
 *
 * `parseContinuityToken` returns `null` (never throws) on anything malformed/foreign/corrupt so
 * every call site can treat "invalid token" and "well-formed but wrong owner" identically (both
 * deny with 404 — never reveal which).
 */
export interface ContinuityTokenPayload {
  conversationId: string;
  customerId: string;
  /** ISO timestamp, informational only — there is no enforced expiry (see DECISIONS.md). */
  issuedAt: string;
}

/** Discriminator so an unrelated base64url blob can never be mistaken for a real token. */
const TOKEN_KIND = 'singha.assistant.continuity.v1';

interface EncodedContinuityToken extends ContinuityTokenPayload {
  kind: typeof TOKEN_KIND;
}

/** Mint an opaque continuity token for the given origin conversation + its owning customer. */
export function issueContinuityToken(input: {
  conversationId: string;
  customerId: string;
}): string {
  const payload: EncodedContinuityToken = {
    kind: TOKEN_KIND,
    conversationId: input.conversationId,
    customerId: input.customerId,
    issuedAt: new Date().toISOString(),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** Decode + structurally validate a continuity token. Never throws — `null` on anything invalid. */
export function parseContinuityToken(token: string): ContinuityTokenPayload | null {
  if (typeof token !== 'string' || token.length === 0 || token.length > 4000) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const p = parsed as Record<string, unknown>;
  if (p.kind !== TOKEN_KIND) return null;
  if (typeof p.conversationId !== 'string' || p.conversationId.length === 0) return null;
  if (typeof p.customerId !== 'string' || p.customerId.length === 0) return null;
  if (typeof p.issuedAt !== 'string' || p.issuedAt.length === 0) return null;

  return { conversationId: p.conversationId, customerId: p.customerId, issuedAt: p.issuedAt };
}
