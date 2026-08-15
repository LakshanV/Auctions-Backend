# CLAUDE COST ROUTING / PHASE PLAN / DEPLOYMENT

## Claude usage
Cheap/fast capability:
repo discovery, repetitive CRUD, DTO wiring, formatting, simple tests/docs, mechanical changes.

Standard:
ordinary service/UI implementation, forms, adapters, normal migrations.

Strongest selectively:
architecture, SaleMethod migration, commercial proposal semantics, sealed confidentiality, auction/offer concurrency, routing, money/FX/fees/tax/payment, security, difficult migrations/debugging, final audit.

De-escalate after the hard reasoning is settled.
Keep `docs/generated/SINGHA_EVOLUTION_STATE.md` and DECISIONS current; use targeted files rather than repeatedly loading whole repos.

## Autonomous phase order
E0 Audit + baseline
E1 Brand/product language + neutral frontend IA
E2 Operator/Market/Location/Unit/SaleMethodDefinition config foundations
E3 Universal Listing evolution
E4 **Commercial Offer Engine V2 — highest functional priority**
E5 Currency/FX/display
E6 Transaction Routing + Terms
E7 Logistics/Ports/Incoterms
E8 Fees/Tax/Payment orchestration
E9 Procurement/Wanted/RFQ/Reverse Tender
E10 Supply Programmes + perishables
E11 Singha ID + Dashboard + Control Centre
E12 Discovery/AI/Intelligence expansion
E13 SEO/local-site integration
E14 full hardening/compatibility/retirement decisions
E15 controlled pilot

Each: implement → test → self-review → correct → retest → report.

## Deployment
Keep Vercel/Railway during development unless a documented reason requires change.
Architect for later Hostinger portability: standard Node/Nest/Next, Postgres, Redis abstraction, S3-compatible storage adapter, env config, health checks/containers where useful.

Per phase: migrations, env vars, flags, staging validation, smoke, monitoring, rollback.

Before public GO:
production load/soak, backup, isolated restore drill, security scans, provider activation tests, accessibility review, monitoring, final owner approval.

Additive DB migrations normally roll back by feature disable + forward-fix; never down-migrate away live data casually.
