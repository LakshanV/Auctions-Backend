# Post-Claude Fix — Status

Phase-0 baseline + running status for the two-pack autonomous fix effort
(`02_TARGETED_STABILISATION_SECURITY_PACK` → `01_FULL_AUTONOMOUS_FIX_PACKAGE`).
Full findings-level detail: [`POST_FIX_AUDIT_REPORT.md`](./POST_FIX_AUDIT_REPORT.md).

## Baselines (audit)

- Backend (canonical, Railway): `Auctions-Backend` @ `e30a276` — clean.
- Frontend (Vercel): `Auctions New` @ `2d00eed` — clean.

## Current HEADs

- Backend: `1b612be`
- Frontend: `338a7fd`

## Baseline verification (Phase 0)

- Backend: typecheck 13/13, unit green, catalogue-v2 e2e green — matched baseline.
- Frontend: `next build` 10/10, package tests green — matched baseline.

## What shipped (all committed to `main`, not pushed)

**Backend** (`e30a276..1b612be`)

- `4bf3a91` P0 security pack (FIX-01..11)
- `6777a24` P5 per-category Rubik cursor endpoint + sale-aware sort
- `18ca1e9` P6 shared realtime fan-out (drop per-viewer SSE polling)
- `f04189d` P7 explicit LKR platform-currency config
- `1b612be` catalogue row e2e robustness

**Frontend** (`2d00eed..338a7fd`)

- `4b99ea9` P0 FIX-11 stream token + FIX-05 uploads
- `e99c956` P5 per-category Rubik bands (independent cursors)
- `4b69d6b` P4 freeze duplicate backend + declare canonical authority
- `9eccbf1` P7 truthful `/how-it-works` + `/terms` (no dead nav links)
- `338a7fd` P8 frontend CI refocus + dead-link gate

## Gate status

- Backend `pnpm check`: green. `pnpm test:acceptance`: 12/12 suites green
  (security 19/19).
- Frontend: build 10/10; route/link check green; package tests green.

## Open (tracked in POST_FIX_AUDIT_REPORT.md → "Not production-ready")

DB-side facets + seeded scale test · multi-instance realtime + 1k-viewer load
gate · generated typed contracts + physical duplicate removal · durable
institutional-seller attribution · migration-safety integration test · remaining
dashboard bands. AI/Connect/Social/Live remain `MOCK_ONLY`/`BLOCKED_CREDENTIALS`.
