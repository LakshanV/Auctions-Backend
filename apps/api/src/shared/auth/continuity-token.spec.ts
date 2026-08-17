import { describe, expect, it } from 'vitest';
import { issueContinuityToken, parseContinuityToken } from './continuity-token';

describe('continuity-token (AIC-2)', () => {
  it('round-trips {conversationId, customerId}', () => {
    const token = issueContinuityToken({ conversationId: 'conv_1', customerId: 'cust_1' });
    const parsed = parseContinuityToken(token);
    expect(parsed?.conversationId).toBe('conv_1');
    expect(parsed?.customerId).toBe('cust_1');
    expect(typeof parsed?.issuedAt).toBe('string');
  });

  it('is opaque (not raw JSON/plaintext ids) and URL-safe', () => {
    const token = issueContinuityToken({ conversationId: 'conv_1', customerId: 'cust_1' });
    expect(token).not.toContain('conv_1');
    expect(token).not.toMatch(/[+/=]/); // base64url, not base64
  });

  it('two tokens for the same input are independently parseable (not required to be byte-identical)', () => {
    const a = issueContinuityToken({ conversationId: 'conv_1', customerId: 'cust_1' });
    const b = issueContinuityToken({ conversationId: 'conv_1', customerId: 'cust_1' });
    expect(parseContinuityToken(a)).toMatchObject({
      conversationId: 'conv_1',
      customerId: 'cust_1',
    });
    expect(parseContinuityToken(b)).toMatchObject({
      conversationId: 'conv_1',
      customerId: 'cust_1',
    });
  });

  it('rejects garbage / non-base64 input', () => {
    expect(parseContinuityToken('not-a-token')).toBeNull();
    expect(parseContinuityToken('')).toBeNull();
  });

  it('rejects a well-formed base64url blob that decodes to unrelated JSON (wrong kind)', () => {
    const foreign = Buffer.from(JSON.stringify({ hello: 'world' }), 'utf8').toString('base64url');
    expect(parseContinuityToken(foreign)).toBeNull();
  });

  it('rejects a token missing required fields', () => {
    const incomplete = Buffer.from(
      JSON.stringify({ kind: 'singha.assistant.continuity.v1', conversationId: 'conv_1' }),
      'utf8',
    ).toString('base64url');
    expect(parseContinuityToken(incomplete)).toBeNull();
  });

  it('rejects an oversized token', () => {
    expect(parseContinuityToken('a'.repeat(5000))).toBeNull();
  });

  it('is NOT an authority by itself: a hand-crafted token can claim ANY {conversationId, customerId} pair', () => {
    // Demonstrates why the token is a LINK, not a credential (see file header): parsing
    // succeeds for an attacker-chosen pair with no signature to fail. Server-side re-
    // verification (ConnectService.inbound's continuation branch) is what actually protects
    // this — proven separately in connect.service.spec.ts.
    const forged = issueContinuityToken({
      conversationId: 'victim_conv',
      customerId: 'victim_cust',
    });
    expect(parseContinuityToken(forged)).toMatchObject({
      conversationId: 'victim_conv',
      customerId: 'victim_cust',
    });
  });
});
