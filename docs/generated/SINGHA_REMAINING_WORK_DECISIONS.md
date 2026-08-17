# SINGHA — Remaining Work Decisions (RW0)

Decisions governing the remaining-work programme. Reversible/internal/covered-by-pack → decided here.

## D-RW-01 — Continue on the existing feature branch, do not reopen merged phases

Both `claude/new-session-at0qp4` branches already sit on latest `main` + additive commits. All RW work
lands additively on these branches. E0–E15, V3, CX, AIC are COMPLETE and are NOT reopened. RW0 confirms
this by evidence, per the "do not rebuild working architecture" rule.

## D-RW-02 — Build order by safety value, then pilot-readiness, then breadth

1. **RW5 sealed-offer seller RBAC** — authorization gap; security-critical; small + well-scoped.
2. **RW3 authorized media download + MIME/size validation** — closes an abuse vector (unvalidated
   uploads) and an access gap (private docs unretrievable); also closes RW1-G's one true backend gap.
3. **RW4 catalogue filters + card hints** — customer function; additive; columns exist.
4. **RW2 AI Vision seller intake** — the headline product capability; provider-agnostic, non-binding,
   per-field provenance; reuses comparables for valuation. Largest vertical.
5. **RW7 benefit-led copy + homepage attention panel** — cheap CX wins (reuse + copy).
6. **RW1 pilot journeys C/D/E/F + A/B tails + G** — author against existing endpoints/e2e exemplars.
7. **RW6 Live roles + lot sequencing** — advanced ops; schema migration; engine already authoritative.
8. **RW10 frozen-copy removal** — code cleanup; retarget local e2e scripts.

RW8 is COMPLETE (pilot-ready). RW9's AI-vision port is folded into RW2; voice/inspection ports are
PROVIDER_GATED and deferred to POST_PILOT unless cheaply framed.

## D-RW-03 — Non-negotiables reaffirmed (every RW item honours these)

One authoritative central transaction system; UI never authoritative; AI derived-only and non-binding
(may recommend/classify/estimate/prepare drafts, never place bids/accept offers/award/bind/alter money/
bypass KYC/expose sealed); original media immutable, AI outputs are derivatives with provenance;
append-only ledgers; server-side authorization; additive-first migrations (expand-migrate-verify-contract);
provider behind adapters; sensitive fields never leave the server.

## D-RW-04 — AI Vision is advisory + per-field provenance, never auto-fact

Vision intake emits `{value, confidence, source, aiSuggested|userConfirmed}` per field and writes only an
`AiRun` (derived record) — it NEVER writes `Asset.attributes` or listing facts. A human accepts/edits/
rejects each field. Valuation is advisory (low/expected/high + confidence + comparables), snapshotted so
later estimates never rewrite history. Provider-agnostic via a new `VisionIntelligenceProvider` port with a
deterministic credential-free fake; real model is PROVIDER_GATED (PRV-1).

## D-RW-05 — RW5 uses a narrow ownership permission, not operator elevation

Add `exchange:operate-own` to `SELLER_PERMISSIONS` and enforce listing-ownership server-side (promote the
owning seller to the domain's existing `'seller'` viewer). A seller manages only their own listing's sealed
offers; they never gain general `exchange:operate`. Adversarial tests: seller A ≠ seller B, buyer can't read
competitor values, unauth denied, seller can't force early reveal, staff path intact, explicit winner
selection still required.

## D-RW-06 — Verify locally; CI is billing-blocked

Because GitHub Actions is `BLOCKED_EXTERNAL_ACCOUNT` (SEC-4), every change is verified with local gate runs
(backend `pnpm check` + targeted e2e; FE `pnpm check` + Playwright/pilot). The final report's verdict rests
on local green, and flags SEC-4 as the owner action to reproduce it in CI.

## D-RW-07 — Scope honesty

Where a phase is large (RW2, RW6), deliver a correct, tested, non-binding, provider-agnostic vertical and
record any deliberately-deferred breadth as POST_PILOT in the final report rather than shipping
half-verified surface. No silent truncation.
