import { describe, expect, it } from 'vitest';
import { MockVoiceProvider } from './voice.provider';

describe('MockVoiceProvider', () => {
  const voice = new MockVoiceProvider();

  it('queues a call with a provider-tagged, reproducible id', async () => {
    const a = await voice.placeCall({ to: '+94771234567', script: 'bid-confirm', locale: 'en' });
    const b = await voice.placeCall({ to: '+94771234567', script: 'bid-confirm', locale: 'en' });
    expect(a.status).toBe('queued');
    expect(a.provider).toBe('mock');
    expect(a.callId).toMatch(/^mock-voice-/);
    expect(a.callId).toBe(b.callId); // deterministic — no clock/random
  });

  it('derives a different id for a different destination/script', async () => {
    const a = await voice.placeCall({ to: '+94771234567', script: 'bid-confirm' });
    const c = await voice.placeCall({ to: '+94770000000', script: 'inspection-reminder' });
    expect(a.callId).not.toBe(c.callId);
  });
});
