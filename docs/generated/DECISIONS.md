# DECISIONS

Meaningful, mostly-reversible technical decisions taken autonomously (docs/02).
Class A = Claude decides; Class B = configurable default. Business (Class C) and
infra (Class D) decisions are NOT made here.

| ID     | Class | Decision                                                                                                      | Rationale                                                                     | Reversibility                  |
| ------ | ----- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------ |
| D-0001 | A     | Monorepo = pnpm workspaces + Turborepo                                                                        | Current standard for TS-first monorepos; task graph + caching                 | High                           |
| D-0002 | A     | pnpm 9 via Corepack; Node ≥ 20                                                                                | Reproducible package manager without global installs                          | High                           |
| D-0003 | A     | Web = Next.js 14.2 + React 18                                                                                 | Stable App Router; matches V1 design source; avoids React 19 churn in Phase 0 | Medium — revisit Next 15 later |
| D-0004 | A     | API = NestJS 10                                                                                               | DI + modules map cleanly onto a modular monolith                              | Medium                         |
| D-0005 | A     | ORM = Prisma 5 on PostgreSQL                                                                                  | Authoritative store; consistent with V1 (migration source)                    | Medium                         |
| D-0006 | A     | Tests = Vitest; API units target decorator-free `*.logic.ts`; DI boot proven by live smoke                    | Avoids SWC-for-decorators complexity while keeping logic covered              | High                           |
| D-0007 | B     | `.npmrc`: shamefully-hoist + auto-install-peers + non-strict peers                                            | Predictable resolution across the monorepo in Phase 0                         | High — tighten in hardening    |
| D-0008 | A     | Root-level framework-agnostic flat ESLint; `next build` lint disabled                                         | One lint config; formatting owned by Prettier; correctness by tsc strict      | High                           |
| D-0009 | A     | Shared libs built with tsup (ESM+CJS+dts); `ui`/`auctionflow` consumed as source via Next `transpilePackages` | Robust cross-runtime consumption (Nest CJS + Next ESM)                        | Medium                         |
| D-0010 | A     | IDs = app-minted ULID (opaque, sortable); human refs separate                                                 | docs/04 permanent-record rule; sortable for pagination                        | Low (foundational)             |
| D-0011 | A     | Domain boundaries = declared manifest graph + acyclic test; import-level enforcement deferred                 | Real, testable boundary today; heavier tooling later                          | High                           |
| D-0012 | A     | Audit append-only enforced by a Postgres trigger rejecting UPDATE/DELETE on `audit_event`                     | docs/04 & docs/15: admins cannot delete audit history                         | Medium                         |
| D-0013 | A     | Money = integer minor units + ISO currency; no floats                                                         | Financial correctness (docs/14)                                               | Low (foundational)             |
| D-0014 | B     | Worker idles without `REDIS_URL`; BullMQ lazy-loaded                                                          | No hard Redis dependency during early dev                                     | High                           |
| D-0015 | A     | `live-console` scaffolded as a minimal placeholder (not a second Next build)                                  | Keeps Phase 0 lean; full build in Phase 11                                    | High                           |
| D-0016 | B     | Local DB via docker-compose OR native Homebrew; ephemeral throwaway cluster for verification                  | Docker not assumed present                                                    | High                           |
| D-0017 | A     | Design system ported from V1 "Auction-House Luxe" (coal/bone/red/gold + HUD) as `@singha/ui` preset           | Follow the requested design/colours from a single source of truth             | Medium                         |
| D-0018 | A     | Server-side RBAC: roles→permissions in contracts + a global Nest guard; ownership checks in services          | Least privilege, testable matrix (docs/15)                                    | Medium                         |
| D-0019 | A     | Auth principal via signed JWT (jose HS256); dev-only `/dev/token` mints test tokens                           | Real enforcement now; login/session issuance is a later security phase        | Medium                         |
| D-0020 | A     | Transactional UnitOfWork writes business change + outbox event + audit in ONE tx                              | docs/16 atomic outbox; docs/04 append-only audit                              | Low (foundational)             |
| D-0021 | B     | Versioned category attribute schemas live in `@singha/contracts` (Zod)                                        | docs/06 category schema versioning; shared by API + tests                     | Medium                         |
| D-0022 | A     | Data-core E2E is an out-of-process driver (real API + ephemeral DB)                                           | Highest fidelity; avoids SWC-in-Vitest for Nest decorators                    | High                           |
| D-0023 | A     | Client ID / Org ref via a Postgres SEQUENCE (`CUS-######`/`ORG-######`), separate from the ULID PK, backfilled resumably | Atomic, never-recycled, collision-free under concurrency; not MAX()+1 (Rev 05 §3/§10) | Medium |
| D-0024 | A     | Credit/security money stored as BigInt minor units + basis-point ratios; all limit maths in pure `@singha/domain` | Never floats for authoritative finance; exhaustively unit-testable (Rev 05 §14) | Medium |
| D-0025 | B     | Bid-capacity enforcement is configurable (`credit.enforcement` = off/facility/strict), default `facility`      | Real protection whenever a facility exists, without breaking cash bidders or the proven engine/tests (Rev 05 §16) | High |
| D-0026 | A     | Exposure gate row-locks the customer's `credit_facility` (`SELECT … FOR UPDATE`) inside the bid tx            | Two simultaneous bids for one customer cannot over-reserve the same line (Rev 05 §7) | High |
| D-0027 | A     | Buyer/Seller is a DERIVED role on one durable Customer (owns assets / org member), never a duplicate record    | Rev 05 §1 "one durable Customer, do not duplicate"                             | Medium |
| D-0028 | A     | Performance is a deterministic, versioned rule engine (not LLM); score `null` = INSUFFICIENT_HISTORY           | Explainable, rebuildable, private; AI may summarize but never sets score (Rev 05 §18/§25) | Medium |
| D-0029 | A     | Customer self view is a SEPARATE DTO from staff Member 360 (flags/score/docs never projected), not CSS-hidden  | Rev 05 §18 visual privacy boundary is enforced server-side                     | High |

## Open items awaiting inputs

- Business values (buyer premium, commission, tax, deadlines, reserve/bid-history
  visibility) are placeholders flagged `approvalRequired` — Class C (docs/20).
- Provider credentials (storage, AI, messaging, live, payments) — Class D
  (docs/21); adapters report "not configured" until supplied.
