# SINGHA EVOLUTION — DECISIONS LOG

Append-only record of meaningful, program-level decisions taken while executing the
Singha Platform Evolution pack (`docs/singha-evolution/`). Newest at the bottom of each
section. Reversible/internal decisions are taken autonomously per the pack; owner-only
items are escalated in `SINGHA_EVOLUTION_STATE.md` → Owner/Legal register.

---

## D0 — Program baseline (E0)
- **Repos & baseline SHAs** (fetched from `origin/main`, matches pack manifest):
  - Frontend `MUA1234/Auctions-New` @ `1172592fb009dafca89000b1265392dea5a88009`
  - Backend `LakshanV/Auctions-Backend` @ `f1676fbe1258c164708a4c667d39b8e83b0cb61c`
- **Source of truth** is repository code; stale status docs are overridden by real code
  where they disagree (pack `00` §5).

## D1 — Branch & delivery model
Work continues on `main` in both repos (the established delivery pattern for this line of
work), with all new platform capability gated behind **feature flags that default OFF**
(pack §46). `main` therefore stays production-safe: nothing new is exposed publicly until a
flag is deliberately enabled. Large or risky mechanical migrations may use a short-lived
branch when that reduces risk, but the default is small, flag-gated, additive commits to
`main`. E0 is documentation-only.

## D2 — Migration policy: additive-first, non-destructive
All schema evolution follows **expand → seed → backfill → verify → (dual read/write if
needed) → switch contracts → retire legacy later** (pack `03`, `05`, `13`). No destructive
`DROP`/`RENAME` in the same phase that introduces a replacement. Permanent records
(Customer/Asset/Listing/Offer/Bid/Sale/Payment/audit) must survive every future rewrite.

## D3 — Sale-method taxonomy migration (do NOT grow the PG enum)
Introduce a `SaleMethodDefinition` table (stable `code`, display names, category, eligibility
hooks) plus an additive `listing.sale_method_code` string/FK **alongside** the existing
`SaleMethod` enum. Seed the current six values, backfill, switch contracts to the code, and
retire the enum only in a later, proven-safe migration. New method codes are configuration,
not enum edits.

## D4 — Sealed-offer semantic correction (mandatory, pack `08`/`15`)
New `SEALED_OFFER` events default to **`MANUAL_SELECTION`**. The highest sealed proposal
**must not** auto-create a binding sale. `AUTO_HIGHEST` exists only as an explicit,
pre-configured, operator/legal-eligible policy with its own tests. The current sealed-tender
auto-award behaviour must **not** be silently carried forward onto the new offer domain.

## D5 — Money, quantity & FX representation
- Fiat money stays in **integer minor units** (existing convention preserved).
- **Quantity** uses database `Decimal`, never JS float (pack `06`).
- **Transaction currency** is binding; **display currency** is an informational preference
  and changing it **must never** mutate contractual currency. Any FX rate used in a binding
  calculation is **snapshotted** with base/quote/rate/provider/quotedAt/expiry/margin.

## D6 — Deterministic core; LLM never binds
All binding logic — money, quantity, FX arithmetic, deadlines, routing, eligibility,
fees/tax, confidentiality, bid/offer validity, transaction state — is **deterministic code**.
The LLM may assist (extraction, matching, comparison, drafting) but never directly decides or
executes a binding money/quantity transaction (pack `05`, `12`, non-negotiable rule 11).

## D7 — Owner/legal config is DRAFT until verified
Claude creates configuration **hooks** but does not invent legal entity names, auction/
licensing eligibility, procurement rules, KYC/licence requirements, tax/VAT/GST conclusions,
payment/escrow authority, transaction legal wording, or export/import/food-certificate rules.
Such config ships as **`DRAFT`/`UNVERIFIED`**; any binding method that depends on unverified
config is blocked and returns **`MANUAL_REVIEW_REQUIRED`**, while staging browse still works
(pack `16`).

## D8 — Feature-flag set (all default OFF; existing V3 flags retained)
Adopt the pack's flag vocabulary as capability gates, all default OFF:
`MULTI_OPERATOR`, `STRUCTURED_LOCATIONS`, `QUANTITY_UNITS`, `MULTI_CURRENCY`, `FX_DISPLAY`,
`COMMERCIAL_OFFERS_V2`, `SEALED_OFFERS`, `COMMODITY_TRADING`, `LOGISTICS`, `LOGISTICS_QUOTES`,
`TRANSACTION_ROUTING`, `RFQ`, `REQUEST_SUPPLY`, `REVERSE_TENDER`, `SUPPLY_PROGRAMMES`,
`INTERNATIONAL_CHECKOUT`, `OPERATOR_PAYMENTS`. Existing V3 flags remain until their surfaces
are fully integrated.

## D9 — Brand & language evolution is non-breaking
Customer-facing language moves toward **Singha** / **Singha Exchange**, with "Auction" reserved
for genuine auction mechanics (Timed/Live Auction, Auction Results/Terms). Legal/historical
names (`Singha Auctions`, entity names) are preserved where legally required. **No** rename may
break audit history, SEO, API compatibility, stable public references or transaction records
(pack `04`). Language changes are semantic/UI-first, not mass find-replace of the token
"auction".

## D11 — Satellite Market Node architecture (owner directive, supersedes pack §7)
Local Singha sites are **not** merely referral/marketing. Each is a configurable **Satellite
Market Node** in one of two modes — **Discovery/Referral** (marketing/SEO/routing into central
inventory) or **Local Commerce** (may originate listings and support local transactions,
offers, bids, payments, logistics, documents). **Invariant:** in both modes, *all binding
commercial state uses the central Singha authoritative backend* — there are **no** per-country
sale/offer/bid/inventory ledgers. Every node reads/writes the **same canonical** `Listing`,
`Offer`, `Auction`, `Sale`, `Payment`, `Shipment` records; the Transaction Routing Engine
resolves the local operator, terms, payment route and compliance rules. A node is
configuration (mode + capabilities + operator links + origin attribution), never a fork or a
separate system of record. Full spec: `docs/singha-evolution/ADDENDUM_A_SATELLITE_MARKET_NODE.md`.
Lands additively in E2 (`MarketNode` config), E6 (routing takes origin node/operator as input
and persists it) and E13 (node surfaces). Gated by `MULTI_OPERATOR`/`TRANSACTION_ROUTING`/
`OPERATOR_PAYMENTS`, all default OFF.

## D10 — Deployment continuity + portability
Keep Vercel (web) / Railway (API+worker) during development. Architect for later Hostinger
portability: standard Node/Nest/Next, Postgres, a Redis abstraction, an S3-compatible storage
adapter, env-driven config, health checks (pack `14`). No deployment change without a
documented reason.
