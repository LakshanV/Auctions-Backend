import { Global, Module } from '@nestjs/common';
import { MALWARE_SCANNER, MockMalwareScanner } from './malware-scanner';

/**
 * RW3 — shared security adapters. Binds MALWARE_SCANNER to the deterministic mock until a real
 * engine (isolated ClamAV daemon or a managed AV) is configured — swap the binding, nothing else
 * changes. Global so any module handling untrusted uploads can inject the scanner.
 */
@Global()
@Module({
  providers: [{ provide: MALWARE_SCANNER, useClass: MockMalwareScanner }],
  exports: [MALWARE_SCANNER],
})
export class SecurityModule {}
