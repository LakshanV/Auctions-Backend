# ADDENDUM A — SATELLITE MARKET NODE ARCHITECTURE (owner directive)

Status: **owner requirement**, received during E0. This **supersedes** the assumption in
`01_OWNER_MASTER_REQUIREMENTS.md` §7 and `11_..._SEO.md` that local Singha websites are
primarily referral/marketing sites. It refines, and is governed by, the Transaction Routing
Engine (`07`) and the single-source-of-truth preservation rules (`05`).

## Directive (verbatim intent)
Replace the assumption that local Singha websites are primarily referral/marketing sites with
a **configurable Satellite Market Node** architecture. Each local Singha site may operate in
one of two modes:

- **Discovery / Referral Mode** — local marketing, SEO, seller acquisition, local content and
  contact info; routes customers into the central platform with the appropriate filters
  (this is the previous §7 behaviour, now just *one* mode).
- **Local Commerce Mode** — the local node may **originate listings** and support local
  transactions, offers, bids, payments, logistics and documents.

**Invariant (non-negotiable):** in *both* modes, **all binding commercial state uses the
central Singha authoritative backend.** There are **no** separate sale, offer, bid or
inventory ledgers per country website. Every local site reads/writes the **same canonical**
`Listing`, `Offer`, `Auction`, `Sale`, `Payment` and `Shipment` records. The **Transaction
Routing Engine** determines the correct local operator, terms, payment route and compliance
rules for each transaction.

## Architectural consequences
1. **One authoritative datastore for binding records.** A Satellite Market Node is a
   presentation + origination + local-routing surface, **not** a separate system of record.
   No per-country database of listings/offers/bids/sales/payments/shipments.
2. **Node identity is configuration, not a fork.** A node has: `code`, display market(s),
   mode (`DISCOVERY` | `LOCAL_COMMERCE`), default location/currency/language presets, the
   `Operator`(s) it may act for, and its enabled capabilities (may it originate listings? take
   offers? run auctions? accept payments?). All of this is data, resolved at request time.
3. **Origination is attribution, not ownership.** When a node in Local Commerce Mode creates a
   listing/offer, the canonical record is stamped with `origin_node` / `origin_operator` for
   audit and routing, but the record lives in the central domain and obeys the same rules,
   flags and routing as any central listing.
4. **Routing still decides the binding facts.** Even when a node collects a local transaction,
   the Transaction Routing Engine (`07`) resolves the transaction operator, terms version,
   payment route, fee/tax/compliance versions and eligible sale methods — or returns
   `MANUAL_REVIEW_REQUIRED`. A node cannot self-assert operator/terms/payment.
5. **Confidentiality & isolation across nodes.** A node/operator must not read another
   operator's protected records (offers, reserves, KYC). Operator-scoped RBAC (`12`, `39`)
   applies identically to node-originated access. Aggregate counts must not de-anonymise.
6. **Capability gating.** Local Commerce Mode is gated by flags (e.g. `MULTI_OPERATOR`,
   `TRANSACTION_ROUTING`, `OPERATOR_PAYMENTS`) and by verified owner/legal config; until a
   node's operator/payment/terms config is verified, binding methods return
   `MANUAL_REVIEW_REQUIRED` while Discovery Mode browse still works.

## Where this lands in the phase plan
- **E2** adds `Operator`/`Market` config → extend with a **`MarketNode`** concept (mode +
  capabilities + operator links). Additive, flag-off.
- **E6** (Transaction Routing) must accept the originating node/operator as routing input and
  persist it on the transaction.
- **E13** is re-scoped from "SEO/local-site integration" to **"Satellite Market Node +
  SEO/local-site integration"**: implement Discovery Mode (routing into central inventory with
  filters + canonical/hreflang SEO) and the Local Commerce Mode surfaces that read/write the
  central canonical records.

## Acceptance additions
- No code path creates a country-scoped ledger for listings/offers/bids/sales/payments/shipments.
- A node-originated listing/offer is retrievable as the **same** canonical record centrally.
- Routing output on a node-originated transaction persists `origin_node` + resolved operator,
  terms version and payment route.
- Cross-node/operator access to protected records is denied and audited.
