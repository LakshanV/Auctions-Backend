# SINGHA — CRM / Operations / OSS Completion Audit (§1)

> **STATUS UPDATE:** this is the point-in-time §1 audit that opened the pass. The P1 gaps it
> flagged (CRM notes/tasks, staff Customer 360 + unified timeline, Agent Inbox, OpenTelemetry) are
> now **built, tested and wired** — see `SINGHA_CRM_OSS_FINAL_REPORT.md` (§27) for the completed
> state, the before→after re-classification, and the verdict
> `ENGINEERING_COMPLETE_FOR_CONTROLLED_PILOT_WITH_OWNER_ACTIONS`. OSS decisions are in
> `SINGHA_OSS_DECISIONS.md`.

_Directive: CRM, Operations & Open-Source Enhancement Completion Pass. Method: audit → decide →
integrate → test. Classifications from 6 parallel read-only source audits over both repos
(backend `Auctions-Backend/apps/api`, frontend `Auctions-New/apps/web`; the frozen `apps/api`/
`apps/worker` copy in the FE repo is out of scope). Baseline: backend `f4d95a0`, FE `4954921`._

**Legend:** FULLY_WORKING (endpoint + logic + wired staff UI) · BACKEND_ONLY (service/route, no staff
UI) · UI_ONLY · PARTIAL · MISSING · PROVIDER_GATED (works, needs real credentials) · OWNER_ONLY.
A Prisma model alone is **not** FULLY_WORKING.

## A. Customer / identity / transaction core (authoritative — keep, §2)

| Capability                                                                                          | Class                                       | Evidence                                                                                                                                 | Gap                                                        |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Customer 360 — core identity (Client ID, legal name, org, KYC, membership, credit, security, flags) | FULLY_WORKING                               | `member.service.ts:622` `member360`, route `member.controller.ts:162` (`MemberRead`, re-checked in service); FE `admin/members/page.tsx` | none for these fields                                      |
| Customer 360 — contact (email/phone)                                                                | PARTIAL                                     | fields `schema:126-127`; absent from `member360` return; only via `GET /customers/:id`                                                   | add to the 360 aggregate                                   |
| Customer 360 — channel identities / language / capabilities                                         | MISSING (from aggregate)                    | `ExternalIdentity`, `CustomerCapability`, prefs exist but not joined into 360                                                            | project into 360                                           |
| Customer search (staff)                                                                             | PARTIAL                                     | `member.service.ts:737` `GET /members/search` (ID/name/email/phone/org); FE wired                                                        | no search by listing/auction/invoice/shipment/external-ref |
| Transactional history — SELF                                                                        | FULLY_WORKING                               | `me.service.ts:86` `/me/dashboard` (bids/watches/EOIs/offers/tenders/invoices/sales/fulfilments)                                         | self only                                                  |
| **Transactional history — STAFF viewing a customer**                                                | **MISSING**                                 | `member360` returns no bids/offers/purchases/RFQs/listings/invoices/shipments                                                            | expose the me-projection for staff (authz'd)               |
| **Unified CRM timeline**                                                                            | **MISSING**                                 | no per-customer chronological projection anywhere                                                                                        | build projection over outbox/audit substrate               |
| Buyer/seller performance                                                                            | PARTIAL                                     | `member.service.ts:587` snapshot + 360 + FE tab                                                                                          | no auto-feed (manual only), no per-org aggregation         |
| Buyer Twin                                                                                          | FULLY_WORKING (flag-gated)                  | `discovery.service.ts:66` + `BuyerTwinPanel.tsx`                                                                                         | none functional                                            |
| Conversation model + 6 channels                                                                     | BACKEND_ONLY (real channels PROVIDER_GATED) | `connect.service.ts` inbound/send/read/mode; `schema:1230`                                                                               | no staff UI; only `web` surfaced; mock channels            |
| AI per-lot context (privacy-filtered)                                                               | FULLY_WORKING                               | `assistant.item-context.ts` double-redact + allowlist                                                                                    | reply model is a mock                                      |

## B. Staff-operations CRM workflow (the gap — §4/§5/§6/§18/§19/§20)

| Capability                                                                                     | Class                     | Evidence                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Support flags                                                                                  | **FULLY_WORKING**         | `MemberFlag` — model+service+controller+`member-flag:manage`+360+audit+FE-read (`member.service.ts:480`). The one wired CRM primitive; the template to mirror. |
| Assigned agent                                                                                 | PARTIAL                   | `Conversation.assignedAgentId` set only on AI→human handoff; `Customer` has no owning agent                                                                    |
| Internal staff notes (first-class, relatable)                                                  | **MISSING**               | only scattered scalar columns (`MemberFlag.privateNote`, `Offer.notes`, …); no `Note` model/endpoint/permission                                                |
| **CRM tasks** (polymorphic, assignee/type/priority/due/status/reminders/AI-vs-human/result)    | **MISSING**               | no task model/service/route/permission anywhere — the single biggest hole                                                                                      |
| Follow-ups / reminders                                                                         | **MISSING**               | none                                                                                                                                                           |
| Escalation                                                                                     | **MISSING**               | `MemberFlagStatus.under_review`/`reviewedBy` exist but are dead (never set)                                                                                    |
| Disputes / issues                                                                              | **MISSING**               | zero references                                                                                                                                                |
| Opportunity pipeline (NEW→…→WON/LOST/DORMANT)                                                  | **MISSING**               | `CustomerStatus` is a coarse account lifecycle, not a pipeline                                                                                                 |
| Safe identity resolution (dedupe + authorized merge)                                           | **MISSING** (blocks only) | unique email/phone + verified-identity resolution exist; no candidate detection, no merge, no `identity:merge`                                                 |
| Agent inbox (list/filter/assign/status/SLA; `resolved` status; conversation-scoped AI suggest) | **MISSING**               | no list endpoint; `ConversationStatus` lacks `resolved`; `/ai/assist` is not conversation-aware; no staff UI                                                   |

## C. Communications / consent / segmentation / campaigns (§7)

| Capability                                                        | Class                                                   | Evidence                                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Communication preferences (per-channel + quiet hours + freq caps) | FULLY_WORKING (flag `engagementV3` OFF; fake transport) | `engagement.service.ts:100`, pure policy `notifications.ts`, FE `NotificationPreferences.tsx`            |
| Marketing consent                                                 | PARTIAL                                                 | `engagementOptIn` bare boolean + policy suppression; no auditable consent ledger; no real marketing path |
| Language preference                                               | PARTIAL                                                 | `CustomerProfile.language` captured, consumed nowhere                                                    |
| Segmentation                                                      | **MISSING**                                             | no audience model/endpoint/UI                                                                            |
| Campaigns (audience/consent-filter/approval/history/metrics)      | **MISSING** (as CRM concept)                            | only `SocialCampaign` = grouped social posts, not customer targeting                                     |
| Delivery engine feeding                                           | PARTIAL                                                 | `dispatch()` invoked only by `/simulate`; real events don't yet produce notifications                    |

## D. Frontend staff surfaces (§3/§4)

All FE app routes: buyer/seller self-service + public, plus only **two** staff trees — `/admin` (+ `/admin/members`) and `/control-centre` (+ `/nodes`). Member 360 + staff search are real (`/admin/members`); Control Centre is partly live (Overview/KYC-decide/node-originate) and partly read-only decision _simulators_ (routing/fees/payments/risk). **No** `staff/agent/crm/inbox/tasks/pipeline/segments/campaigns` routes exist; the only conversation UI (`SinghaAssistant`) is customer-facing.

## E. OSS / infrastructure current state (§8–16)

| Concern                   | State                    | Note                                                                                                                                                                                      |
| ------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenTelemetry             | ABSENT                   | custom `packages/observability` (pino logger + in-memory metrics + correlation-id); metrics layer explicitly designed for an OTel/Prometheus exporter drop-in                             |
| Search                    | PARTIAL — Postgres ILIKE | no `tsvector`/`pg_trgm`/GIN, no `CatalogueSearchProvider` port; AI search-interpreter re-validates to `catalogueQuerySchema`                                                              |
| Vector / embeddings       | ABSENT                   | only perceptual-hash duplicate detection; Buyer Twin/comparables are Prisma aggregation                                                                                                   |
| OCR                       | ABSENT (designed)        | `OCRProvider` named in existing `SINGHA_OSS_DECISIONS.md`, 0 code                                                                                                                         |
| BI / analytics            | PARTIAL — in-app Prisma  | dashboard/insight/intelligence aggregate on the OLTP DB; no Superset/read-replica                                                                                                         |
| Chatwoot / external inbox | ABSENT                   | native AI↔human handoff instead; no `ExternalAgentInboxProvider` port                                                                                                                     |
| Temporal                  | ABSENT                   | transactional outbox + BullMQ worker instead                                                                                                                                              |
| Provider-adapter pattern  | **PRESENT (strong)**     | **14 DI provider ports** (AI, vision, storage, channel, voice, notification, fx, logistics, live, social, inspection, malware, realtime, deterministic-image) — OSS slots in behind these |

Deploy: Railway (API + BullMQ worker + Supabase Postgres + Storage, Redis optional) + Vercel (FE). Local dev compose = Postgres + Redis only.

## Build plan (per §26 priority)

**P1 (this pass) — Singha-native, authoritative:**

1. CRM **Notes + Tasks** spine (new `crm` module): first-class polymorphic append-only notes + tasks (links, type, priority, due, remind, assignee, source ai-vs-human, result), RBAC + audit + tests. Escalation/disputes/pipeline layer onto this next.
2. Staff **Customer 360 extension**: staff endpoint for a customer's transactional history + a **unified timeline** projection + contact/notes/tasks in the 360.
3. **Agent Inbox**: list conversations + channel/agent/status filters + explicit assign + `resolved` status + conversation-scoped AI-suggested reply.
4. **OpenTelemetry**: tracing behind a replaceable exporter (drop-in the observability layer was designed for).

**P2/P3/OPTIONAL — decisions recorded in `SINGHA_OSS_DECISIONS.md`, adopt behind existing ports only if they clearly win:** Superset (BI), pgvector (first vector layer), OCR (Tesseract/PaddleOCR benchmark), Meilisearch (only if search benchmark justifies), Temporal, Qdrant, Chatwoot. **Do NOT embed** Twenty CRM (AGPL/enterprise licensing).

Segmentation/campaigns (§7), opportunity pipeline (§6), escalation/disputes (§4), identity-merge (§20): layer onto the Notes+Tasks foundation after P1.
