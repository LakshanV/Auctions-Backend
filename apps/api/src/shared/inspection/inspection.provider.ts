import { Logger } from '@nestjs/common';

/**
 * RW9 — inspection / certification port (docs/12; matrix PRV-3). A provider-neutral seam for
 * third-party physical verification: gem-lab certification (GSI/GIA), vehicle/machinery inspection,
 * assay. A real lab/inspector plugs in behind THIS interface with no domain change; real activation
 * is PROVIDER_GATED (PRV-3).
 *
 * Non-negotiables: an inspection outcome is EVIDENCE, a derived record that informs a listing — it
 * is never an authoritative overwrite of the asset's facts (rule 3) and never binds a sale. A
 * certificate reference is stored; the original certificate document flows through the RW3 secure
 * media pipeline (scanned + access-controlled), not this port.
 */
export type InspectionKind =
  'gem_certification' | 'vehicle_inspection' | 'machinery_inspection' | 'assay' | 'general';

export interface InspectionRequest {
  /** Opaque subject reference (asset/listing id) — the port never mutates the subject. */
  subjectRef: string;
  kind: InspectionKind;
  notes?: string;
}

export interface InspectionResult {
  inspectionId: string;
  status: 'requested' | 'scheduled' | 'in_progress' | 'completed' | 'failed';
  kind: InspectionKind;
  provider: string;
  /** Present only once a certificate has been issued (never fabricated). */
  certificateRef?: string;
}

export interface InspectionProvider {
  readonly name: string;
  requestInspection(req: InspectionRequest): Promise<InspectionResult>;
  fetchResult(inspectionId: string): Promise<InspectionResult | null>;
}

export const INSPECTION_PROVIDER = Symbol('INSPECTION_PROVIDER');

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
 * Deterministic, credential-free inspection fake. It records the REQUEST (status `requested`) and
 * never fabricates a certificate — an honest "not yet certified" until a real lab returns one.
 * Swapping in a real provider replaces only the two methods.
 */
export class MockInspectionProvider implements InspectionProvider {
  readonly name = 'mock';
  private readonly logger = new Logger('MockInspectionProvider');

  async requestInspection(req: InspectionRequest): Promise<InspectionResult> {
    this.logger.debug(`inspection requested: ${req.kind} for ${req.subjectRef}`);
    return {
      inspectionId: stableId('mock-insp', `${req.subjectRef}|${req.kind}`),
      status: 'requested',
      kind: req.kind,
      provider: this.name,
      // No certificateRef — the mock never invents a certificate.
    };
  }

  async fetchResult(_inspectionId: string): Promise<InspectionResult | null> {
    // The credential-free fake has no backing lab to poll, so there is nothing to report yet.
    return null;
  }
}
