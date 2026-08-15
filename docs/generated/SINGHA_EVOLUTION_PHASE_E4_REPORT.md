# SINGHA EVOLUTION — PHASE E4 REPORT (Commercial Offer Engine V2)

**Verdict: E4a PASS (schema + the money-critical engine, exhaustively tested).** Additive,
behind the (default-OFF) offer flags. Baseline BE `8353487` → this phase. The HTTP surface +
atomic DB acceptance are **E4b** (see "Remaining").

E4 is the pack's highest functional priority and money-critical, so it ships in two increments:
E4a = the additive data model + the pure, unit-tested offer/sealed-selection **engine** (the D4
core); E4b = the API endpoints + the locked, atomic accept→Sale path + real-DB tests.

## E4a delivered

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

**Pure domain engine** (`@singha/domain` `exchange/offer-revision.ts`, 11 tests) — owns the rules
so they can't drift:

- Revision numbering (append-only) + counter-author identification.
- **Sealed confidentiality** (pack doc 20): `sealedParticipationView` returns **counts only**
  (participants / offers received), never amounts; `revealedRankedOffers` **throws** before a
  reveal or for a buyer/unauthorised viewer — competitor prices can't leak.
- **`selectSealedWinner` — the DECISIONS D4 core**: `MANUAL_SELECTION` (the default) never
  auto-awards the highest — it requires an explicit chosen offer and returns exactly that one
  (even the lowest, since a seller may pick on full terms); `AUTO_HIGHEST` picks the highest
  **only** when explicitly configured; no winner before reveal.

**Contracts** (`offer-domains.ts`) — `offerProposalSchema` (full commercial bundle; money in
minor units, quantity as string; must carry a price), `submitOfferSchema` / `counterOfferSchema`,
award-policy + author + freight enums.

## Self-review (pack 13)

- **Gates:** `turbo build` 7/7; `typecheck` 13/13 (regenerated client; schema valid); `@singha/
domain` 108 tests (11 new) + `@singha/contracts` 25; `lint` 0 errors; `format:check` clean.
- **Migration safety:** additive-only (no DROP/RENAME); immutability enforced by the
  `@@unique([offerId, revisionNumber])` constraint.
- **D4 encoded as tests:** MANUAL_SELECTION refuses to pick without an explicit choice; the
  would-be-highest is never auto-selected; AUTO_HIGHEST works only when set; default is
  MANUAL_SELECTION. **Confidentiality** encoded: counts-only pre-reveal; ranked view gated on
  reveal + role.
- **Deterministic core:** all binding selection logic is pure code (no LLM; D6).

## Remaining in E4 (E4b)

- `offers` NestJS module (flag-gated `COMMERCIAL_OFFERS_V2` / `SEALED_OFFERS`): submit / counter /
  reject / withdraw, sealed reveal (authorised), and **binding acceptance** — lock the
  listing + offer rows, verify not already awarded, revalidate method/routing/KYC, snapshot the
  selected revision, and create **one** `Sale` atomically with audit/outbox (reusing the existing
  UoW/Sale/credit patterns).
- Add the runtime `commercialOffersV2` / `sealedOffers` flags (default OFF); real-Postgres
  integration + concurrency tests (concurrent acceptance / already-awarded race; sealed no-leak;
  manual selection; counter revisions).

## Next

Finish **E4b** (offer API + atomic acceptance + concurrency/confidentiality integration tests),
then **E5** — currency / FX / display currency, with the **Google-currency** FX adapter (D12)
behind the abstract provider layer.
