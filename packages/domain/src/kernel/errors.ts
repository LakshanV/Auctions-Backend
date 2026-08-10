/** Base class for all domain-rule violations. Carries a stable machine code. */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** A guarded invariant was broken (programmer/data error, not user input). */
export class InvariantViolation extends DomainError {
  constructor(message: string) {
    super('INVARIANT_VIOLATION', message);
  }
}

/** A requested state transition is not legal from the current state. */
export class IllegalTransition extends DomainError {
  constructor(message: string) {
    super('ILLEGAL_TRANSITION', message);
  }
}
