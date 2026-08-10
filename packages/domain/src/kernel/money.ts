import { InvariantViolation } from './errors';

/**
 * Money as an integer count of minor units (e.g. cents) plus an ISO currency.
 * Never use floats for money (docs/14 financial ledger). Arithmetic across
 * currencies is rejected — conversion is an explicit, separate concern.
 */
export class Money {
  private constructor(
    readonly minorUnits: number,
    readonly currency: string,
  ) {}

  static of(minorUnits: number, currency: string): Money {
    if (!Number.isInteger(minorUnits)) {
      throw new InvariantViolation(`Money minorUnits must be an integer, got ${minorUnits}`);
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new InvariantViolation(`Currency must be a 3-letter ISO code, got ${currency}`);
    }
    return new Money(minorUnits, currency);
  }

  static zero(currency: string): Money {
    return Money.of(0, currency);
  }

  private sameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new InvariantViolation(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }

  add(other: Money): Money {
    this.sameCurrency(other);
    return Money.of(this.minorUnits + other.minorUnits, this.currency);
  }

  subtract(other: Money): Money {
    this.sameCurrency(other);
    return Money.of(this.minorUnits - other.minorUnits, this.currency);
  }

  isNegative(): boolean {
    return this.minorUnits < 0;
  }

  isZero(): boolean {
    return this.minorUnits === 0;
  }

  greaterThan(other: Money): boolean {
    this.sameCurrency(other);
    return this.minorUnits > other.minorUnits;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.minorUnits === other.minorUnits;
  }

  toString(): string {
    return `${this.currency} ${(this.minorUnits / 100).toFixed(2)}`;
  }
}
