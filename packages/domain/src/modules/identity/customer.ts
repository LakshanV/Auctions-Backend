import { type CustomerId } from '@singha/contracts';
import { IllegalTransition } from '../../kernel/errors';

/**
 * Identity module (docs/05). A Customer's VERIFIED FACTS (legal/contact/KYC) are
 * kept strictly separate from AI-derived intelligence (the Buyer Twin lives
 * elsewhere and never overwrites these facts).
 */
export type CustomerStatus = 'prospect' | 'active' | 'suspended' | 'closed';
export type KycStatus = 'none' | 'pending' | 'verified' | 'rejected';

export interface VerifiedFacts {
  legalName?: string;
  email?: string;
  phone?: string;
  kycStatus: KycStatus;
}

export class Customer {
  private constructor(
    readonly id: CustomerId,
    private _status: CustomerStatus,
    readonly facts: VerifiedFacts,
  ) {}

  static register(id: CustomerId, facts: Partial<VerifiedFacts> = {}): Customer {
    return new Customer(id, 'prospect', { kycStatus: 'none', ...facts });
  }

  get status(): CustomerStatus {
    return this._status;
  }

  activate(): void {
    if (this._status === 'closed') {
      throw new IllegalTransition('Cannot activate a closed customer');
    }
    this._status = 'active';
  }

  suspend(): void {
    if (this._status === 'closed') {
      throw new IllegalTransition('Cannot suspend a closed customer');
    }
    this._status = 'suspended';
  }
}
