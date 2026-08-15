# SINGHA EVOLUTION — PHASE E13 REPORT (Satellite Market Node + SEO)

**Verdict: E13 PASS** — additive, behind the default-OFF `satelliteNodes` flag. Baseline BE `8d615ba`
to this phase. E13 implements the **Satellite Market Node** architecture (pack Addendum A) and the
deterministic **SEO / local-site** helpers (doc 11). The non-negotiable invariant it enforces: a node
is a presentation / origination / routing surface over the **one central** authoritative domain —
there is **no per-country ledger**. A node-originated listing is the _same_ canonical record
centrally; origination is attribution, gated by mode / capability / verification, and a node can
never self-assert operator / terms / payment.

## Delivered

**Contracts** (`node-domains.ts`) — `nodeCapabilities` (`listings`/`offers`/`auctions`/`payments`);
`originateSchema`, `seoCanonicalSchema`, `seoListingSchema`.

**Pure domain engine** (`@singha/domain` `modules/node`, 10 tests):

- **Node modes / origination gating** (`node.ts`) — `resolveNodeCapabilities` (Discovery browse is
  always available) and `assessOrigination`: a Discovery node originates nothing (`DISCOVERY_ONLY`); a
  Local Commerce node needs the capability enabled (`CAPABILITY_DISABLED` otherwise) and verified owner
  config, otherwise the binding path is a non-binding `MANUAL_REVIEW_REQUIRED` preview (D7); only a
  verified, enabled node is `ALLOWED`, and even then the record is created centrally with origin-node
  attribution.
- **SEO** (`seo.ts`) — `canonicalUrl` strips display-currency and tracking params so **one listing has
  one canonical URL** across every local site and display currency; `hreflangAlternates` (per-locale +
  x-default); `listingJsonLd` (schema.org Product/Offer, exact minor→major price, float-free);
  `sitemapEntries`.

**Schema** — one additive table `node_origination` (append-only attribution/routing audit snapshot);
migration `20260815220000_evolution_e13_satellite_node` is a single `CREATE TABLE` with an index,
**zero** DROP/RENAME/ALTER. It is deliberately **not** a per-country ledger of
listings/offers/bids/sales/payments/shipments — those remain the single central canonical records
(the node-originated listing is stored in the existing central `Listing` with `origin_node_id`
attribution from E3).

**API** (`modules/node`, flag-gated `satelliteNodes`) — `GET /api/v1/nodes/:code` (presentation) and
`GET /nodes/:code/discovery` (central inventory attributed to the node) are public marketing surfaces;
`POST /nodes/:code/originate` (`exchange:operate`) runs the gating and persists a `node_origination`
snapshot; `POST /seo/canonical` and `POST /seo/listing-jsonld` return the deterministic SEO artefacts.

**Runtime flag** `satelliteNodes` (default **OFF**) across `@singha/config` (3 files) and the DB
`FeatureFlag` seed.

## Self-review (pack 13)

- **Gates:** `turbo build` 7/7; `typecheck` 13/13; `@singha/domain` **202** tests (10 node),
  `@singha/contracts` 25, `@singha/api` **54** (1 node spec), `@singha/config` 14; `lint` **0 errors**
  (pre-existing e2e-script warnings only); `format:check` clean. Real-Postgres E2E
  `scripts/e2e-node.mjs` (wired into `test:node`, the acceptance chain and a CI step) seeds four nodes
  (Discovery, verified/unverified/no-capability Local Commerce) and a central Listing attributed to a
  node, and proves: node resolution; the full origination gating matrix (DISCOVERY_ONLY /
  MANUAL_REVIEW_REQUIRED / CAPABILITY_DISABLED / ALLOWED); operator-only origination (buyer 403); the
  **node-originated listing retrieved as the same central canonical record** via Discovery; the SEO
  canonical stripping display currency + tracking; hreflang x-default; and exact JSON-LD.
- **Central-ledger invariant (Addendum A):** no code path creates a country-scoped ledger for
  listings/offers/bids/sales/payments/shipments; a node originates by writing the central `Listing`
  with `origin_node_id`, and `node_origination` is an audit snapshot, not a system of record.
- **Routing still decides binding facts:** origination is gated and non-binding until verified; a node
  cannot self-assert operator/terms/payment (that stays the E6 routing engine's job).
- **Server-side authorisation (rule 9):** origination requires `exchange:operate`; the surface 404s
  while the flag is OFF (unit spec).
- **Migration safety:** additive-only (one new audit table); existing tables untouched.

## Owner actions (non-blocking)

- **O1 / O4** apply to _binding_ node origination: until a node's operator/terms/payment config is
  owner-verified, Local Commerce origination returns `MANUAL_REVIEW_REQUIRED` while Discovery browse
  works. This is the intended gating, not a defect.

## Next

**E14** — Hardening / compatibility / legacy-retirement decisions.
