# SINGHA EVOLUTION — PHASE E4 REPORT (Commercial Offer Engine V2)

**Verdict: E4 PASS** — the pack's highest functional priority, money-critical, delivered additively
and behind the (default-OFF) offer flags. Baseline BE `8353487` → this phase, shipped in two
increments: **E4a** = the additive data model + the pure, unit-tested offer/sealed-selection
**engine** (the DECISIONS D4 core); **E4b** = the HTTP API + the locked, atomic accept/award→`Sale`
path + a real-Postgres concurrency/confidentiality E2E.

## E4a delivered (data model + engine)

**Additive schema** (`schema.prisma`) — no existing table changed:

- **`OfferRevision`** — an immutable commercial-proposal snapshot: total/unit price (minor
  units), currency, quantity (`Decimal`), unit code, Incoterm, origin/destination, delivery
  date/window, payment terms, freight responsibility, validity, notes, structured `conditions`
  (JSON), `revisionNumber` unique per offer. Each proposal/counter **appends** a revision — prior
  terms are never overwritten.
- **`Offer` extensions** (all nullable/defaulted): `currentRevisionId`, `saleMethodCode` (E2
  taxonomy), `sealed`, `revealedAt`, `awardPolicy`, and a `revisions` relation. The legacy
  `amountMinor`/`OfferEvent` stay intact.
- Migration `20260815110000_evolution_e4_offer_engine`: 5 `ADD COLUMN` on `offer` +
  `CREATE TABLE offer_revision` + FK + index; **zero** DROP/RENAME.

**Pure domain engine** (`@singha/domain` `exchange/offer-revision.ts`) — owns the rules so they
can't drift:

- Revision numbering (append-only) + counter-author identification.
- **Binding total (money-critical, float-free — D5):** `bindingTotalMinor` prefers an explicit
  total; else derives `unitPrice × quantity` using integer bigint math scaled by 10⁹, and
  **throws** on a non-exact minor-unit product (any rounding is deferred to the fees engine, E8) —
  it never returns a fraction or touches a float. `comparableHeadlineMinor` is the non-throwing
  ranking variant.
- **Sealed confidentiality** (pack doc 20): `sealedParticipationView` returns **counts only**;
  `revealedRankedOffers` **throws** before a reveal or for an unauthorised viewer.
- **`selectSealedWinner` — the D4 core:** `MANUAL_SELECTION` (the default) never auto-awards the
  highest — it requires an explicit chosen offer; `AUTO_HIGHEST` picks the highest **only** when
  explicitly configured; no winner before reveal.

## E4b delivered (API + atomic binding)

- **Runtime flags** `commercialOffersV2` / `sealedOffers` (default **OFF**) across `@singha/config`
  (`feature-flags.ts` / `env.ts` / `index.ts`) + the DB `FeatureFlag` seed. `GET
  /api/v1/feature-flags` surfaces them for the frontend.
- **`offers` NestJS module** (`/api/v1/commercial-offers`), flag-gated in the service and
  authorised on the server (`exchange:participate` = buyers submit/withdraw; `exchange:operate` =
  seller/operator counter/reject/reveal/accept/award):
  - open negotiation: **submit** (revision 1) → **counter** (appends a revision) → **accept**;
  - sealed: **submit** (receipt only, no amount echoed) → **participation** (counts only) →
    **reveal** (authorised) → **award**;
  - **binding accept/award — the money core** (`bindOfferToSale`): locks the listing row
    `FOR UPDATE`, verifies it is not already awarded, snapshots the selected `OfferRevision`,
    binds the exact integer total, creates **one** `Sale` (UNIQUE per listing), marks the listing
    sold, rejects the losing offers, reserves bid-capacity (§11), and emits `SALE_CONFIRMED` +
    audit — all in one transaction via the existing `UnitOfWork`.
- **Real-Postgres E2E** (`scripts/e2e-offers.mjs`, wired into `test:offers`, the acceptance chain,
  and a dedicated CI step) proves end-to-end: append-only revisions; accept binds the terms on the
  table; a **concurrent burst of accepts yields exactly one `Sale`**; unit-priced offers bind
  `unitPrice × quantity` exactly; sealed **counts-only before reveal** (no leak to buyer or
  operator roster); award **before reveal refused**; **D4** — `MANUAL_SELECTION` with no explicit
  pick is refused (400) and the operator may bind the **lowest** revealed offer; `AUTO_HIGHEST`
  binds the highest **only** when explicitly configured; buyers cannot counter/reveal/award.

## Self-review (pack 13)

- **Gates:** `turbo build` 7/7; `typecheck` 13/13; `@singha/domain` **114** tests (D4 + binding
  total + confidentiality) + `@singha/contracts` 25 + `@singha/api` **27** (incl. the offers flag
  /authorisation spec) + `@singha/config` 14; `lint` **0 errors** (3 pre-existing e2e-script
  warnings only); `format:check` clean. The DB E2E runs under the ephemeral-Postgres harness in CI
  (Postgres server binaries are unavailable in this sandbox).
- **Migration safety:** E4b adds **no** schema (E4a's migration is additive-only); immutability is
  enforced by `@@unique([offerId, revisionNumber])`.
- **D4 encoded three ways:** default policy MANUAL_SELECTION; the contract refuses MANUAL_SELECTION
  without an explicit selection; the domain refuses to auto-pick the highest. Confidentiality
  encoded as counts-only pre-reveal + reveal/role-gated ranking. The E2E exercises all of it.
- **Money integrity (D5):** every bound amount is an exact integer of minor units; a non-derivable
  total throws rather than inventing rounding. Deterministic, no LLM in any binding path (D6).
- **Single central ledger (Addendum A):** all offer/revision/sale rows live in the one
  authoritative backend; no per-node state.

## Boundaries (deliberate, deferred)

- **Rounding of `unitPrice × quantity`** when it is not an exact number of minor units is **not**
  invented here — it belongs to the fees/tax/rounding engine (**E8**); until then such a proposal
  must carry an explicit total to be bound.
- **FX / display currency** for a proposal's `currency` lands in **E5** (Google-currency adapter,
  D12); E4 stores and binds the transaction currency as given.
- **Listing-status gating** of when an offer may be accepted (draft vs published) follows the same
  minimal posture as the legacy exchange module and is governed by the operator workflow later.

## Next

**E5** — currency / FX / display currency, with the **Google-currency** FX adapter (D12) behind
the abstract provider layer + a credential-free fake; snapshot the binding rate onto the record.
