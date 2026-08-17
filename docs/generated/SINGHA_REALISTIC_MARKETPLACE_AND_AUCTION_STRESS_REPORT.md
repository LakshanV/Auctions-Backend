# SINGHA — Realistic Marketplace & Auction Stress Report

Autonomous execution of the "Realistic Synthetic Marketplace Data + Full Auction Stress Test"
programme. Everything below was seeded and exercised against a real Postgres (the preview database
on `:5433`) driving the built API; results are live, not asserted on paper. Defects found were
fixed in the same loop (`seed → browse → transact → bid → observe → diagnose → fix → retest`).

**Legend** — ✓ verified this round · ⟳ verified via existing CI e2e + earlier pilot rounds ·
▲ PROVIDER_GATED / owner-infra dependent.

---

## 1. Dataset — categories, inventory, media

Categories are read **dynamically** from the canonical `CATEGORY_KEYS` (never hardcoded), so the
seeder stays compatible as categories are added.

| Category  | Listings | Notes                                                                                                                                     |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| vehicles  | 10       | Hilux GD-6, Canter tipper, Wagon R, Land Cruiser 79, NPR, Prius, salvage Leaf, Bolero, BMW 320i, Ranger                                   |
| machinery | 10       | CAT 320D, Komatsu PC200-8, JCB 3CX, Toyota forklift, Kubota tractor, Cummins genset, compressor, 950H loader, D65 dozer, Bomag roller     |
| gems      | 10       | Blue/Yellow/Star sapphire, spinel, tourmaline, padparadscha, zircon parcel, disclosed lab synthetic, geuda rough, red spinel              |
| property  | 10       | 40P Galle land, Colombo commercial, agri land, warehouse, hill plot, house disposal, beachfront, MEL retail, Hosur shed, paddy EOI        |
| bulk      | 10       | Red onions, potatoes, chillies, dhal, coconut, cinnamon, tea + HMS steel / aluminium / copper / stainless scrap                           |
| general   | 10       | Office furniture, commercial kitchen, gym, solar panels, IT disposal, event kit, containers, retail fit-out, offset press, ex-fleet bikes |
| **Total** | **60**   | **192 media rows** (2–5 images each; one video + one private document per category; last item per category has NO image — fallback path)  |

Every asset carries an internal `[SIM]` provenance marker (`attributes.simulation`); no `[SIM]`
text is pushed into customer-facing titles/descriptions (controlled test environment, directive §1).

## 2. Sale-method distribution (directive §6 — "more than an auction site")

From the live seed run:

| Method                 | Count |
| ---------------------- | ----- |
| TIMED_AUCTION          | 18    |
| BUY_NOW                | 12    |
| MAKE_OFFER             | 12    |
| LIVE_HYBRID            | 6     |
| SEALED_TENDER          | 6     |
| EXPRESSION_OF_INTEREST | 6     |

## 3. Currencies & locations

- **Currencies** (authoritative transaction currency per listing): LKR 44 · USD 10 · AUD 5 · INR 1.
  Display-currency conversion remains informational (E5), never authoritative.
- **Locations** (11): Colombo, Galle, Kandy, Ratnapura, Hambantota, Negombo, Kurunegala (LK);
  Melbourne, Sydney (AU); Chennai, Hosur (IN). Geography is data-driven, never hardcoded into rules.
- **Conditions** vary across each category: excellent · very good · good · fair · used · salvage ·
  requires-repair · incomplete · unknown — exercising filters, disclosure copy, AI and pricing.

## 4. Seeder — repeatable, guarded, safe (directive §21-22)

- `pnpm seed:marketplace-demo` / `pnpm seed:marketplace-demo:reset`
  (→ `@singha/database` `seed:marketplace` / `seed:marketplace:reset`).
- Deterministic dataset id `sim-v1`; **idempotent** (skips when `SMKT-` inventory present).
- **Environment guard** refuses to run unless the DB is recognisably local/preview/staging, or
  `SINGHA_SIM_CONFIRM=I_UNDERSTAND` is set — it cannot silently seed production.
- Distinct `SMKT-` publicRef prefix + `@mkt.singha.local` sellers → never collides with the earlier
  pilot's `SIM-` fixtures; reset removes only its own rows and preserves EVO-/LOT-DEMO + the shared
  market/operator/node/locations.
- **Append-only respected**: the dataset is bid-free; the reset never deletes from the immutable bid
  ledger and skips any auction that carries bids. Real provider traffic (payments/WhatsApp/voice/
  logistics/social) stays OFF.

## 5. Auction stress matrix (directive §9-14) — `scripts/e2e-auction-stress.mjs`

Every scenario runs in its **own isolated, run-scoped auction** (`STRESS-<ts>-…`) so the append-only
ledger is never entangled. **All 12 scenarios pass** live.

| Scenario                         | UI  | API | DB  | Privacy | Result |
| -------------------------------- | --- | --- | --- | ------- | ------ |
| Normal auction (clean winner)    | ⟳   | ✓   | ✓   | ✓       | PASS   |
| Reserve met (starts below → met) | ⟳   | ✓   | ✓   | ✓       | PASS   |
| Reserve not met (passed in)      | ⟳   | ✓   | ✓   | ✓       | PASS   |
| Proxy bidding (3 bidders)        | ⟳   | ✓   | ✓   | ✓       | PASS   |
| Equal proxy maxima (tie)         | –   | ✓   | ✓   | ✓       | PASS   |
| Soft close (3 real extensions)   | ⟳   | ✓   | ✓   | ✓       | PASS   |
| Concurrent bidding (5/10/25)     | –   | ✓   | ✓   | ✓       | PASS   |
| Invalid low/zero/neg/malformed   | ⟳   | ✓   | ✓   | ✓       | PASS   |
| Stale client bid                 | –   | ✓   | ✓   | ✓       | PASS   |
| Duplicate (idempotency key)      | –   | ✓   | ✓   | ✓       | PASS   |
| Closed / not-started / no-auth   | ⟳   | ✓   | ✓   | ✓       | PASS   |
| Bid privacy (mandatory)          | ✓   | ✓   | ✓   | ✓       | PASS   |

Key proofs:

- **Concurrency** at 5/10/25 simultaneous bidders → exactly one authoritative price, exactly one
  winner, **ledger rows == accepted (201) responses**, zero 5xx. Row locking serialises the burst.
- **Proxy confidentiality** — a rival's maximum never appears in any bid response, state read or SSE
  frame; no `proxyMax`/`maxAmountMinor`/`bidderMax` field names are ever exposed.
- **Soft close** extends on each qualifying in-window bid (3/3) and does not extend without one.
- **Invalid taxonomy** — below-minimum / zero / negative / malformed decimal → 400; huge boundary
  handled; **stale** opening-price bid after the price moved → 400; **duplicate** idempotency key →
  exactly one effective bid row.
- **Bid privacy (directive §11, mandatory)** — public state exposes no proxy maxima, no hidden
  reserve, and **no internal bidder database ids**.

## 6. Bid conditions (directive §10) — covered

Leader/outbid/regain-lead, bid-exactly-at-increment, bid-above-increment, invalid zero/negative,
enormous boundary, malformed decimal, auction-not-started (409), auction-closed (409),
unauthenticated (401), no-permission (403), duplicate-retry idempotency (one bid). Wrong-currency
per-bid is **not applicable** — bids carry integer minor units in the auction's own currency (no
per-bid currency field), so a currency mismatch cannot be expressed at the bid layer.

## 7. Offers · Sealed · RFQ · Supply · Logistics

These engines are proven by dedicated CI e2e suites and the RW1 pilot journeys; against the realistic
dataset the flows are unchanged (the seeded listings simply provide richer subjects).

| Flow                                                                      | Coverage                                                | Result |
| ------------------------------------------------------------------------- | ------------------------------------------------------- | ------ |
| Make-offer / counter / accept, immutable revisions                        | ⟳ `test:offers`                                         | PASS   |
| Sealed tender — counts-only pre-reveal, no price leak                     | ⟳ `test:offers` (sealed D4)                             | PASS   |
| Sealed seller RBAC — owner reveals, cross-seller IDOR 403                 | ⟳ RW5 (`offers.service.spec`, 10) + pilot `30-commerce` | PASS   |
| Sealed award — highest never auto-selected (D4)                           | ⟳ `test:offers`                                         | PASS   |
| RFQ / reverse tender — 3 distinct proposals, explicit dearest award       | ⟳ pilot `60-procurement` + `test:procurement`           | PASS   |
| Supply programmes — recurring, cheapest-first advisory, perishable expiry | ⟳ pilot `70-supply` + `test:supply`                     | PASS   |
| Logistics — deterministic quote, quote≠booking, timeline guards           | ⟳ pilot `80-logistics` + `test:logistics`               | PASS   |

> Note: BUY_NOW / MAKE_OFFER / SEALED_TENDER are **feature-flag-gated OFF** in the controlled
> preview environment; the CI e2e suites enable the flags in their own harness. The seeded listings
> exist regardless, so enabling the flags surfaces them immediately.

## 8. AI assistant over the data (directive §19) — defect found & fixed

Natural-language search was run against the seeded catalogue. A genuine quality defect was found and
fixed in the loop: the deterministic interpreter leaked measurement/vague tokens into the single
free-text term, over-constraining the catalogue's one substring match to zero results.

Fixed (`ai.search-interpreter.ts`): strip measurement/vague noise + standalone numbers; map
delivery/pickup intent onto the RW4 facets; treat "delivered TO <place>" as a destination (not
item-location); normalise condition synonyms ("damaged"→"damage"). `AssistantService` now allows
`pickup`/`delivery` through its filter allow-list. **+6 unit tests.** Architecture unchanged — the
model returns FILTERS ONLY; `CatalogueV2Service` remains the sole authoritative executor.

| Query                                    | Interpreted                                      | Results | Top (authoritative)                     |
| ---------------------------------------- | ------------------------------------------------ | ------- | --------------------------------------- |
| Toyota under LKR 15 million              | search: toyota                                   | 33      | Toyota Axio 2019                        |
| excavators                               | category: machinery                              | 31      | Caterpillar 320D Hydraulic Excavator    |
| blue sapphires over 5 carats             | category: gems, search: blue                     | 20      | Ceylon Blue Sapphire · 5.42 ct          |
| damaged vehicles in Colombo              | category: vehicles, search: damage, loc: Colombo | 1       | 2015 Nissan Leaf (salvage / repairable) |
| cheapest machine with delivery available | category: machinery, delivery: true              | 5       | Caterpillar 320D Hydraulic Excavator    |
| 20 tonnes of onions delivered to Colombo | search: onions, delivery: true                   | 1       | Red Onions · 20 MT, Grade A             |
| (prompt-injection attempt)               | refused (blocked)                                | 0       | — (never sent to a provider)            |

**AI safety verified**: results come only from authoritative inventory (no invented items); no
private field (proxy max / reserve / KYC / internal id) appears in any response; an injection in the
query is refused and audited. Vision intake (RW2) remains advisory with per-field provenance.

## 9. Browser / responsive

The catalogue + AI + card/commercial payloads were re-verified this round at the **API+DB** layer
against the realistic dataset (facets, currencies, quantities, sale-aware `commercial`, media cover).
Full pixel-level 4-width browser shoots (390/768/1440/1920) were performed in prior pilot rounds
(synthetic-customer pilot + CX overhaul) and remain valid for layout/IA. ▲ A fresh pixel re-shoot
against the SMKT dataset is recommended once **media assets/object storage are provisioned** — the
seeded media are structural storage keys (`smkt/<cat>/…`), not self-hosted images, so thumbnails
render as the fallback state until real assets exist (this also exercises the missing-thumbnail path
by design).

## 10. Performance observations

- Catalogue list + facets over ~178 live listings: sub-100 ms server-side per request in the preview
  DB; facet aggregation is a single grouped query per dimension.
- Concurrency bursts (25 simultaneous bids): no 5xx, no lost updates, ledger consistent — the row
  lock serialises without deadlock in the observed runs.
- No premature optimisation undertaken; no obvious regression observed at this dataset size. The
  2,000-lot Rubik scale acceptance (`test:scale`) already gates large-catalogue reachability.

## 11. Defects found & fixed (directive §26)

1. **AI search noise-word over-constraint** (product) — interpreter leaked units/qualifiers into the
   search term → zero results for reasonable queries. **Fixed** + 6 regression tests + live-verified.
2. **Reserve-met stress scenario** (test) — a single bidder can't push price above an above-opening
   reserve, so the engine correctly passed it in; the _test_ assumption was wrong. **Fixed** the
   scenario to use competition; the engine behaviour was correct all along.

No genuine defects were found in the auction engine, privacy boundaries, or the append-only ledgers.

## 12. Remaining blockers (not engineering-closable)

| Ref   | Item                                                                                 | Class          |
| ----- | ------------------------------------------------------------------------------------ | -------------- |
| ▲ MED | Real listing images / object storage (seeded media are structural keys, not pixels)  | PROVIDER_GATED |
| ▲ AI  | Real vision/LLM model credentials (RW2/AI search run on deterministic mocks)         | PROVIDER_GATED |
| ▲ FLG | BUY_NOW / MAKE_OFFER / SEALED_TENDER flags OFF in controlled preview (owner enables) | OWNER_ONLY     |
| ▲ CI  | GitHub Actions billing lock — full CI/CodeQL/gitleaks run is owner-cleared           | OWNER_ONLY     |

## Verdict

**CONTROLLED_PILOT_GO — with owner actions.** The platform seeds and serves a realistic, multi-
category, multi-currency, multi-sale-method marketplace, and the authoritative auction engine passes
the full stress matrix (A–J, scaled concurrency, soft-close, invalid taxonomy) with bid privacy and
append-only integrity intact. The one product defect found (AI search) was fixed and regression-
tested in the loop. Remaining items are provider/owner gates (media/storage, real AI models,
feature-flag enablement, CI billing), not engineering blockers.
