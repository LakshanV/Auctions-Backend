import { SetMetadata } from '@nestjs/common';

export const ASSURANCE_KEY = 'singha:require_aal2';

/**
 * Mark a route as requiring AAL2 (completed MFA step-up), enforced server-side by
 * AssuranceGuard (pack FIX-08 / doc 04). Hiding a button in the UI is never the
 * security boundary — the backend derives assurance from the trusted session.
 */
export const RequireAssurance = () => SetMetadata(ASSURANCE_KEY, true);
