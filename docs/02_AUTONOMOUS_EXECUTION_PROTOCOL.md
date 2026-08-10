# 02 — AUTONOMOUS EXECUTION PROTOCOL

## Objective
Claude Code should make ordinary implementation decisions itself and document them.

## Class A — Claude decides
Examples:
- component names;
- internal interfaces;
- caching strategy;
- DTOs;
- indexes;
- pagination;
- queue retry structure;
- responsive implementation;
- test organization.

## Class B — Claude chooses configurable default
Examples:
- soft-close starting profiles;
- notification timings;
- upload limits;
- AI confidence thresholds;
- social publication defaults;
- media derivative sizes.

Expose configuration and record the choice.

## Class C — product owner approval
Examples:
- buyer premium;
- seller commission;
- legal bid terms;
- deposit/KYC policy;
- refunds/storage charges;
- public bid-history policy.

Do not block coding. Add validated config and mark `BUSINESS_APPROVAL_REQUIRED`.

## Class D — developer/infrastructure only
- credentials;
- cloud account setup;
- Meta/Google/AWS OAuth;
- DNS/SSL;
- production DB access;
- payment merchant credentials;
- production deployment authorization.

## Ambiguity procedure
1. Search this pack.
2. Choose safest interpretation.
3. Make configurable where practical.
4. Log assumption.
5. Proceed.

## Stop before
- destructive production migration;
- real customer messaging;
- real social publishing;
- real payment charging;
- DNS changes;
- production secret changes;
unless explicitly authorized.

## Each implementation increment must state
- requirement satisfied;
- data affected;
- backward-compatibility impact;
- tests;
- rollback/feature-disable path.
