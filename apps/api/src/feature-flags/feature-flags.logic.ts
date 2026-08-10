import { type AppConfig, pendingBusinessApprovals } from '@singha/config';
import { API_VERSION } from '@singha/contracts';

/** Read-only view of active features + provider status + pending approvals. */
export function featureFlagsView(config: AppConfig) {
  return {
    apiVersion: API_VERSION,
    features: config.features,
    providers: config.providers,
    pendingBusinessApprovals: pendingBusinessApprovals(config),
  };
}

export type FeatureFlagsView = ReturnType<typeof featureFlagsView>;
