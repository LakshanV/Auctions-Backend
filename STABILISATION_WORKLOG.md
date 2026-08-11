# Singha Auctions V2 — Stabilisation & Security Worklog

Autonomous execution of `02_TARGETED_STABILISATION_SECURITY_PACK`.
Format: issue → fix → files → tests → status.

## Baselines (audit)

- Backend (canonical): `LakshanV/Auctions-Backend` @ `e30a27616f9f26bed8adbfa6c6eb6df1693732b8` — local HEAD identical, tree clean.
- Frontend: `MUA1234/Auctions-New` @ `2d00eedccff8cf9db7c1ac3e1a2e052c50940933` — local HEAD identical, tree clean.
- Repos map: backend = `/Users/mua/Documents/GitHub/Auctions-Backend` (Railway); frontend = `/Users/mua/Documents/GitHub/Auctions New` (Vercel).

## Baseline verification (recorded)

- pnpm 9.15.0, node 24.18.0.
- `pnpm typecheck` → 13/13 green.
- `pnpm test` (unit) → 7/7 green.
- `pnpm test:catalogue-v2` (ephemeral Postgres e2e) → green. Harness (`with-ephemeral-db.mjs` + booted API) works.
- No deviations from baseline.

## Fix log

| ID     | Issue                                                                                       | Files                                                                                     | Tests           | Status |
| ------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------- | ------ |
| FIX-01 | Public single-lot detail leaked drafts (findUnique, no status filter)                       | catalogue-v2.service.ts                                                                    | S01/S02         | done   |
| FIX-02 | Cover/gallery/videoAvailable ignored visibility+readiness → private/processing media leaked | catalogue-v2.service.ts                                                                    | S03/S04         | done   |
| FIX-03 | Media write endpoints had no object-level authz (IDOR across sellers)                        | asset-authz.ts, media.service.ts, media.controller.ts                                     | S05/S06/S22 + unit | done   |
| FIX-04 | registerMedia accepted arbitrary storageKey + marked ready without object verification       | media.service.ts, storage.provider.ts (+ supabase/unconfigured impls), commands.ts        | S07             | done   |
| FIX-05 | Fake READY / filename fallback on failed upload                                              | media.service.ts, **frontend** sell/new/page.tsx                                           | S08             | done   |
| FIX-06 | Documents used an unconstrained visibility string                                            | commands.ts (mediaVisibility enum), media.service.ts                                       | S09             | done   |
| FIX-07 | Direct video registration bypassed object verification                                       | media.service.ts (verified object → ready), commands.ts                                    | gallery/videoAvailable | done   |
| FIX-08 | Sensitive commands lacked step-up (MFA/AAL) enforcement                                       | jwt.ts, assurance.guard.ts, require-assurance.decorator.ts, dev.controller.ts + 4 command controllers | S10/S11/S12 + unit | done   |
| FIX-09 | Production could boot with demo auth / default secrets / wildcard CORS (fail-open)            | packages/config/src/env.ts, production-invariants.test.ts                                  | S13/S14/S15     | done   |
| FIX-10 | Supabase JWTs weren't verified; JIT customer provisioning unhardened                         | supabase-jwt.ts, jwt.ts, identity-provisioning.ts, principal.middleware.ts, principal.ts, shared.module.ts | S16–S19 (unit/code) | done   |
| FIX-11 | Private dashboard SSE put the bearer token in the URL                                        | **frontend** lib/api.ts (streamDashboard authenticated fetch reader), dashboard/page.tsx  | S20             | done   |

Additional matrix rows verified in the security e2e:

- **S21** — public auction state leaks no proxy/bidder/reserve (getState is privacy-safe).
- **S22** — cross-seller listing edit → 403 (updateContent ownership).
- **S23** — media re-registration is idempotent (same id, no duplicate row).

## Frontend fixes (this repo = `Auctions New`)

- FIX-11: `streamDashboard()` opens the SSE stream with `fetch()` + `Authorization` header (token never in URL); 20s quiet-poll fallback. `dashboard/page.tsx` uses it.
- FIX-05: `sell/new/page.tsx` no longer registers a fake `READY` with a filename fallback when an upload fails — the backend now rejects such keys (400) and the UI no longer attempts it.

## Release gate — results

**Backend (Gate A — `pnpm check`)**: format:check ✓, lint ✓, typecheck (13/13) ✓, build ✓, unit tests ✓
(api 15 incl. `security.spec.ts` 8, worker 2).

**Backend security e2e (`pnpm test:security`)**: booted API on ephemeral Postgres — **all 19 security checks passed** (S01–S12, S21, S22, S23; "All security E2E checks passed.").

**Backend acceptance (`pnpm test:acceptance`)**: full domain e2e suite incl. the new security suite — green (verified in prior session; `e2e-data-core.mjs` updated to the secure register contract).

**Frontend**: prettier clean on changed files; `next build` (turbo 10/10) green.

**CI**: added `.github/workflows/` security CI to the canonical backend (P1 #13) — the security e2e now runs on the repo where the fixes live.

## Status

✅ **Stabilisation & Security Pack COMPLETE — release gate PASSED.**
Next: `01_FULL_AUTONOMOUS_FIX_PACKAGE/00_START_HERE.md` (not yet started).
