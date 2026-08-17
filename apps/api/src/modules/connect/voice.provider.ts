import { Logger } from '@nestjs/common';

/**
 * RW9 — Singha Connect voice/telephony port (docs/09 "…and future voice"). A provider-neutral seam
 * for outbound voice (bid confirmations, inspection reminders, IVR callbacks) so a real carrier
 * (Twilio/Vonage/local telco) plugs in behind THIS interface with no domain change. Real activation
 * is PROVIDER_GATED (PRV-2). Voice is a communication surface only — like every channel it can
 * carry a bid INTENT at most, never a binding action (rule 11); the auction engine stays
 * authoritative (rule 12).
 */
export interface VoiceCallRequest {
  /** E.164 destination number (never logged in full by a real adapter). */
  to: string;
  /** The message/script to speak or the IVR template key. */
  script: string;
  locale?: string;
}

export interface VoiceCallResult {
  callId: string;
  status: 'queued' | 'ringing' | 'completed' | 'failed';
  provider: string;
}

export interface VoiceProvider {
  readonly name: string;
  placeCall(req: VoiceCallRequest): Promise<VoiceCallResult>;
}

export const VOICE_PROVIDER = Symbol('VOICE_PROVIDER');

/** FNV-1a — a tiny deterministic id hash so the fake is reproducible in tests (no clock/random). */
function stableId(prefix: string, seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${prefix}-${(h >>> 0).toString(16)}`;
}

/**
 * Deterministic, credential-free voice fake. Exercises the initiate-call seam without any carrier
 * call or cost; swapping in a real carrier replaces only `placeCall()`. Returns `queued` with a
 * reproducible call id derived from the destination + script.
 */
export class MockVoiceProvider implements VoiceProvider {
  readonly name = 'mock';
  private readonly logger = new Logger('MockVoiceProvider');

  async placeCall(req: VoiceCallRequest): Promise<VoiceCallResult> {
    // A real adapter must never log the full number; the mock logs only a redacted tail.
    this.logger.debug(`queue voice call to …${req.to.slice(-3)} (${req.locale ?? 'default'})`);
    return {
      callId: stableId('mock-voice', `${req.to}|${req.script}`),
      status: 'queued',
      provider: this.name,
    };
  }
}
