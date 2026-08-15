# SINGHA EVOLUTION — CURRENT → TARGET GAP ANALYSIS (E0)

Evidence-based audit of both repositories at the program baseline, mapping today's code to the
pack's target (`docs/singha-evolution/`). Strategy vocabulary: **KEEP → EXTEND → WRAP →
MIGRATE → RETIRE → ADD**. Repository code is the source of truth; where older status docs
disagree, this document follows the code.

- **Backend** `LakshanV/Auctions-Backend` @ `f1676fbe1258c164708a4c667d39b8e83b0cb61c`
  — NestJS + Prisma monorepo; apps `api` + `worker`; packages `@singha/{contracts,domain,config,database,observability,test-utils}`.
- **Frontend** `MUA1234/Auctions-New` @ `1172592fb009dafca89000b1265392dea5a88009`
  — Next.js 14 App Router `@singha/web`; UI system `@singha/ui`; Flow via `@singha/auctionflow`.

Method: two full read-only code audits (domain/schema/contracts/CI on the backend; IA/language/
sale-methods/flags/design-system on the frontend). File:line anchors below are load-bearing.

---

## 1. Posture in one paragraph
The platform has **strong, well-tested foundations but is single-tenant and auction-led**. The
domain core is clean and category-neutral where it matters (`Asset` + versioned attribute
schemas + `Listing`), with append-only ledgers, a transactional outbox, a pure/testable auction
engine with row-locked concurrency and a credit-exposure gate, and serious CI (unit + real-
Postgres E2E + security S01–S23 + contract snapshot + CodeQL). What's missing is the entire
**neutral commerce layer** the target needs: no Operator/tenant, no structured Location, no
Quantity/Unit, no FX, no procurement/reverse flows, no logistics depth, no versioned fee/tax/
routing — and a **fixed 6-value `SaleMethod` Postgres enum**. The correct move is **extend, not
rewrite**: additive config domains + an immutable Offer revision model + a routing layer, all
behind default-OFF flags, preserving every proven control.

## 2. Strengths to PRESERVE (do not rebuild)
| Strength | Evidence | Rule |
|---|---|---|
| Asset↔Listing split; enduring assets | `schema.prisma` Asset(205)/Listing(232) | KEEP |
| Versioned category attribute schemas (the real neutral extension point) | `packages/contracts/src/categories.ts`, `Asset.schemaVersion` | KEEP/formalize |
| Append-only ledgers, trigger-enforced | `Bid`(656), `LedgerEntry`(795), `AuditEvent`(515) + append-only migrations | KEEP |
| Transactional outbox + versioned domain events | `OutboxEvent`(537), `@singha/contracts events.ts` (~55 events) | KEEP |
| Pure auction engine + row-locked UoW + credit gate | `packages/domain/.../auction/engine.ts`; `auction.service.ts:129` `FOR UPDATE`; `unit-of-work.ts:45-107`; `CreditExposureService` | KEEP |
| Immutable media + provenance | `MediaObject`/`MediaDerivative` | KEEP |
| Contract snapshot gated in CI; strong E2E/security | `contracts/public-api.contract.json`, `.github/workflows/ci.yml` (`check`→e2e→security→contract:check) | KEEP |
| FE V3 visual system, Flow, self-hosted logo, CSP discipline | `@singha/ui`, `@singha/auctionflow`, `next.config.mjs` CSP | KEEP |

## 3. Gap table (Current → Target → Strategy)
| # | Current (evidence) | Target | Strategy | Phase |
|---|---|---|---|---|
| 1 | `SaleMethod` **Postgres enum**, 6 values, only on `Listing.saleMethod` (`schema.prisma:64-71,235`; enum in `migrations/…_init/migration.sql:17`) | Configurable sale-method definitions (RFQ, reverse tender, supply agreement…) | **ADDITIVE MIGRATION**: add `SaleMethodDefinition` + `listing.sale_method_code`; seed 6; backfill; switch contracts; retire enum later | E2 |
| 2 | `Offer` = mutable row + append-only `OfferEvent`; counter **overwrites** `amountMinor` in place (`exchange.service.ts:224-227`); no revisions | `Offer` + **immutable `OfferRevision`** (price/qty/unit/incoterm/origin/dest/delivery/payment/validity/conditions) + append-only events; counter = new revision | **EXTEND** | **E4** |
| 3 | Sealed tender **auto-awards highest at open** (`exchange.service.ts:375-442`: sort desc → `winner=ranked[0]` → immediate `Sale`, no reserve/tie-break/manual award) | Sealed offer default **`MANUAL_SELECTION`**; `AUTO_HIGHEST` only as explicit preconfigured policy | **WRAP/MIGRATE + semantic correction** (see §4) | E4 |
| 4 | No Operator/tenant; "seller" == `Organization` | First-class `Operator` (legal/local routing entity) + operator-scoped data | **ADD** | E2 |
| 5 | Location = free-text `locationCity`/`locationRegion` (`Listing:232`); no roles/geo/ports | Structured `Location` with roles: asset/seller/custodian/pickup/export-origin/destination | **ADD + backfill** | E2/E3 |
| 6 | No quantity/unit; every listing is one indivisible lot; `quantity`/`unit` only as `bulk` JSON (`categories.ts:53-57`) | `UnitDefinition` + quantity (`Decimal`) + pricing basis (per-unit/total/tiered) + partial/lot policy | **ADD** | E2/E3 |
| 7 | Single-currency; `currency:String @default("LKR")`; `PLATFORM_CURRENCY='LKR'` with "never sum across currencies" guard (`business-config.ts:22`) | Transaction (binding) vs Display (informational) currency + FX adapter (snapshotted rates) | **EXTEND** | E5 |
| 8 | Each `SaleMethod` = hardcoded service path; no strategy layer | Deterministic **Transaction Routing Engine** (operator/terms/payment/fees/tax/compliance/eligibility or `MANUAL_REVIEW_REQUIRED`) | **ADD** | E6 |
| 9 | Two-layer terms absent; `publicTermsRef` string only | Platform Terms + Transaction Terms (operator/jurisdiction/method resolved) | **ADD** | E6 |
| 10 | `Fulfilment` = linear state machine + single `releaseRef`; no carrier/route/port/incoterm | Ports/Airports/Depots, Transport Methods, Routes, Quotes, Bookings, Shipments + Incoterms | **ADD** | E7 |
| 11 | Fees/tax flat: env `%` + flat invoice columns (`env.ts:52-54`, `Auction.buyerPremiumPct`) | **Versioned** fee/tax/rules engine (by operator/jurisdiction/category/method/value); persist applied version | **ADD** | E8 |
| 12 | Manual bank-transfer `Payment` only; no provider routing | Payment orchestration → regulated per-operator routes; separated fee components | **ADD** (owner-gated) | E8 |
| 13 | No demand side; tender is forward-only | RFQ / Request-Supply / Reverse Tender / Procurement events (two-sided market) | **ADD** | E9 |
| 14 | No recurring supply | `SupplyProgramme` (origin/qty/frequency/min-max/pricing/validity) generating listings/offers | **ADD** | E10 |
| 15 | No perishable metadata | Harvest/pack/expiry/grade/cold-chain/certificates/shipment-window + auto-expiry | **ADD** (category schema) | E10 |
| 16 | `Customer` (`identity`) solid but lacks currency/lang/tz/company-role/licence prefs | **Singha ID** extensions; capability-based verification | **EXTEND** | E11 |
| 17 | Dashboard/admin partial | Unified customer command-centre + **Control Centre** (operators/markets/FX/ports/fees/tax/units/…) | **EXTEND/ADD** | E11 |
| 18 | Local sites assumed marketing-only | **Satellite Market Node** (Discovery + Local Commerce), one central ledger (Addendum A) | **ADD (config)** | E2/E6/E13 |
| 19 | Dead/duplicate `FeatureFlag` DB model vs authoritative config/env path (`feature-flags.logic.ts`) | One clear flag source (config/env authoritative; DB model retire or repurpose) | **RETIRE/decide** | E14 |

## 4. Critical semantic correction (mandatory, pack `08`/`15`)
The current sealed-tender open **irrevocably auto-awards the highest bid** with no reserve check
and no manual step — `apps/api/src/modules/exchange/exchange.service.ts:375-442`:
```
await ctx.tx.tenderBid.updateMany({ where:{ listingId }, data:{ openedAt: now }});
const ranked = [...bids].sort((a,b) => Number(b.amountMinor - a.amountMinor));
const winner = ranked[0];                        // → immediate Sale, listing 'sold'
```
Target: the new `SEALED_OFFER` path defaults to **`MANUAL_SELECTION`** — reveal ranks to the
authorised seller/admin, who then Accept/Counter/Reject/Extend/Negotiate/Change-Method/Send-to-
Auction. `AUTO_HIGHEST` is allowed **only** as an explicit, pre-configured, operator/legal-
eligible policy with its own tests. The legacy auto-award behaviour must **not** be carried
onto the new offer domain. Binding acceptance stays atomic/idempotent (lock rows, verify not
already awarded, revalidate routing/eligibility/KYC, snapshot revision + applied rules, reserve
capacity, one `Sale`, emit audit/outbox) — reusing the existing UoW + credit-exposure patterns.

## 5. Frontend gap (target IA + universal cards + language)
- **IA is auction-centric.** Nav (`lib/nav.ts:2-8`) = Catalogue/Events/Dashboard/Live/How-it-
  works (+ flag-gated Discover). No Explore/Exchange/Sell/Wanted/Services. → **E1** new nav model
  + routes.
- **Brand is "Singha Auctions" + broad "auction" framing.** Hardcoded in `BrandLogo.tsx:16`,
  `layout.tsx:23,28`, `Footer.tsx:54`, home/how-it-works/terms/account titles; hero copy
  "…real-time auctions" (`page.tsx:124`), metadata "world-class …exchange" (`layout.tsx:25`).
  → **E1** rename to Singha/Singha Exchange; "Auction" only for genuine auction mechanics;
  build the language/glossary audit.
- **Sale-method taxonomy duplicated across ~6 files and inconsistent** (EOI vs
  EXPRESSION_OF_INTEREST; `LIVE_HYBRID` unlabelled): `flags.ts`, `lib/categories.tsx:181-188`,
  `sell/new/page.tsx:61-68`, `lot/[id]/page.tsx:14-20`, `SalePanel.tsx`, `LotStickyDock.tsx`. →
  **E1/E3** single shared method module fed by `SaleMethodDefinition`.
- **No location filter, no currency selector** (`CatalogueBrowser.tsx` filters = category +
  method only; `format.ts:2` LKR default). → **E5** currency toggle; **E2/E3** location facet.
- **No quantity/unit/price-basis** in cards or lot page (`api.ts` card/detail types). → **E3**
  universal card fields.
- **Preserve** the V3 visual system, palette quirk (`red`=green, `gold`), container-page/wide,
  Poppins(`font-serif`)/Manrope(`font-display`), CSP self-hosted images.

## 6. Satellite Market Node (Addendum A)
Local sites become configurable **Market Nodes** (Discovery/Referral **or** Local Commerce). In
both modes, binding records use the **one central authoritative backend** — no per-country
ledgers; every node reads/writes the same canonical `Listing`/`Offer`/`Auction`/`Sale`/
`Payment`/`Shipment`, with the Routing Engine resolving operator/terms/payment/compliance and
`origin_node`/`origin_operator` stamped for attribution. Lands additively: `MarketNode` config
(E2), routing input+persistence (E6), node surfaces (E13). See
`docs/singha-evolution/ADDENDUM_A_SATELLITE_MARKET_NODE.md`.

## 7. Two riskiest migrations — approach
- **SaleMethod enum → definitions** (do not grow the PG enum): add `SaleMethodDefinition`
  (code PK, names, category, eligibility hooks) + `listing.sale_method_code`; seed the 6; dual-
  read (`saleMethod` enum still populated) → switch catalogue/contract reads to `code` → retire
  enum in a later migration. Contract snapshot (`contract:check`) guards FE compatibility.
- **Offer → Offer + OfferRevision**: new tables/flags alongside the existing `Offer`/`OfferEvent`
  (which stay working under the current flags). `COMMERCIAL_OFFERS_V2` gates the new path;
  legacy remains until parity is proven, then legacy offer creation is disabled (data retained).

## 8. Sequenced plan
Phase order and status live in `SINGHA_EVOLUTION_STATE.md`; program decisions in
`SINGHA_EVOLUTION_DECISIONS.md`; owner-gated items in the STATE Owner/Legal register. Next
buildable, non-owner-blocked work after E0 is **E1** (brand/IA/language, FE-led, additive) and
**E2** (Operator/Market/Location/Unit/SaleMethodDefinition + MarketNode config foundations),
which unblock **E4 (Commercial Offer Engine V2)** — the highest functional priority.
