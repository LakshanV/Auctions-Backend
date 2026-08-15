import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { type PaymentWebhookInput, type ResolvePaymentRouteInput, newId } from '@singha/contracts';
import {
  type ConfigVerification,
  type PaymentRouteView,
  resolvePaymentRoute,
} from '@singha/domain';
import { type Prisma } from '@singha/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';

/**
 * Payment orchestration service (Evolution E8b, pack doc 10). Resolves the regulated, operator-
 * specific payment route for a transaction (external providers only — Singha holds no internal
 * balance/escrow) and persists a `PaymentIntent`. Webhook intake is signature-verified and
 * idempotent (UNIQUE provider+eventId). An unverified route yields `MANUAL_REVIEW_REQUIRED` (owner
 * O4). Flag-gated by `operatorPayments`.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private requireFeature(): void {
    if (!this.config.get().features.operatorPayments) {
      throw new NotFoundException('Payment orchestration is not enabled');
    }
  }

  /** Resolve + persist a regulated payment route for a transaction shape. */
  async resolveRoute(input: ResolvePaymentRouteInput) {
    this.requireFeature();
    const routes = await this.prisma.paymentRoute.findMany({
      where: { active: true, operatorCode: input.operatorCode },
    });
    const resolution = resolvePaymentRoute(
      input,
      routes.map((r) => this.toRouteView(r)),
    );

    const intentId = newId();
    await this.prisma.paymentIntent.create({
      data: {
        id: intentId,
        status: resolution.status,
        operatorCode: input.operatorCode,
        currency: input.currency,
        purpose: input.purpose,
        amountMinor: input.amountMinor == null ? null : BigInt(input.amountMinor),
        routeCode: resolution.routeCode,
        provider: resolution.provider,
        providerKind: resolution.providerKind,
        requiresManualSettlement: resolution.requiresManualSettlement,
        reason: resolution.reason,
        input: input as unknown as Prisma.InputJsonValue,
      },
    });
    return { intentId, ...resolution };
  }

  /** Signature-verified, idempotent webhook intake from an external provider. */
  async handleWebhook(input: PaymentWebhookInput) {
    this.requireFeature();
    if (!this.verifySignature(input)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    try {
      await this.prisma.paymentWebhookEvent.create({
        data: { id: newId(), provider: input.provider, eventId: input.eventId, type: input.type },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        // Replay of an already-processed event — idempotent no-op.
        return { received: true, duplicate: true };
      }
      throw error;
    }
    return { received: true, duplicate: false };
  }

  /** HMAC-SHA256 over `provider:eventId:type`, constant-time compared. Empty secret rejects all. */
  private verifySignature(input: PaymentWebhookInput): boolean {
    const secret = this.config.get().payments.webhookSecret;
    if (!secret) return false;
    const expected = createHmac('sha256', secret)
      .update(`${input.provider}:${input.eventId}:${input.type}`)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(input.signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private toRouteView(r: {
    code: string;
    version: number;
    priority: number;
    provider: string;
    providerKind: string;
    instructionsRef: string | null;
    operatorCode: string;
    currency: string | null;
    jurisdiction: string | null;
    saleMethodCode: string | null;
    purpose: string | null;
    verification: string;
    active: boolean;
  }): PaymentRouteView {
    return {
      code: r.code,
      version: r.version,
      priority: r.priority,
      provider: r.provider,
      providerKind: r.providerKind as PaymentRouteView['providerKind'],
      instructionsRef: r.instructionsRef,
      operatorCode: r.operatorCode,
      currency: r.currency,
      jurisdiction: r.jurisdiction,
      saleMethodCode: r.saleMethodCode,
      purpose: r.purpose,
      verification: r.verification as ConfigVerification,
      active: r.active,
    };
  }
}
