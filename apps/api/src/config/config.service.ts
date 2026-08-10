import { Injectable } from '@nestjs/common';
import { type AppConfig, loadConfig } from '@singha/config';

/** Nest wrapper over the typed @singha/config loader (validated once at start). */
@Injectable()
export class AppConfigService {
  private readonly config: AppConfig = loadConfig();

  get(): AppConfig {
    return this.config;
  }
}
