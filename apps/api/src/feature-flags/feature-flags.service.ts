import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { featureFlagsView, type FeatureFlagsView } from './feature-flags.logic';

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly config: AppConfigService) {}

  view(): FeatureFlagsView {
    return featureFlagsView(this.config.get());
  }
}
