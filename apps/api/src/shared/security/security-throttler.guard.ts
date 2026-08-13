import { type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * Route-aware rate limiter (anti-clone retrofit doc 02/04). Rate limiting is a
 * PRODUCTION control: it is skipped in dev/test so local E2E suites that hammer
 * the API from a single IP are never throttled — except when a test explicitly
 * opts in via `SECURITY_THROTTLE_TEST=1`. On a breach it emits a privacy-safe
 * security event (route class only — never the client IP) so abusive enumeration
 * and bid/auth floods are observable, then returns the standard 429.
 */
@Injectable()
export class SecurityThrottlerGuard extends ThrottlerGuard {
  private readonly log = new Logger('security');

  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const active =
      process.env.NODE_ENV === 'production' || process.env.SECURITY_THROTTLE_TEST === '1';
    if (!active) return true;
    return super.shouldSkip(context);
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const req = context
      .switchToHttp()
      .getRequest<{ method?: string; originalUrl?: string; url?: string }>();
    const path = req.originalUrl ?? req.url ?? '';
    this.log.warn(
      `SECURITY_EVENT ${rateEventCode(path)} class=${routeClass(path)} method=${req.method ?? '?'} limit=${detail.limit}`,
    );
    return super.throwThrottlingException(context, detail);
  }
}

function routeClass(path: string): string {
  if (path.includes('/members/search')) return 'STAFF_MEMBER_SEARCH';
  if (/\/auctions\/[^/]+\/bids/.test(path)) return 'BID_COMMAND';
  if (path.includes('/catalogue')) return 'PUBLIC_CATALOGUE';
  if (path.includes('/media')) return 'MEDIA';
  if (path.includes('/customers')) return 'REGISTRATION';
  return 'OTHER';
}

function rateEventCode(path: string): string {
  if (path.includes('/members/search')) return 'MEMBER_SEARCH_RATE_HIGH';
  if (/\/auctions\/[^/]+\/bids/.test(path)) return 'BID_COMMAND_RATE_HIGH';
  if (path.includes('/catalogue')) return 'CATALOGUE_ENUMERATION_RATE_HIGH';
  if (path.includes('/media')) return 'MEDIA_FETCH_RATE_HIGH';
  if (path.includes('/customers')) return 'REGISTRATION_RATE_HIGH';
  return 'REQUEST_RATE_HIGH';
}
