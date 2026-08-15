# SINGHA PLATFORM EVOLUTION — EXECUTE THIS FIRST

Canonical repos:
- Frontend: `MUA1234/Auctions-New`
- Backend: `LakshanV/Auctions-Backend`

This is a continuation, not a rewrite.

Before code:
1. Fetch latest `origin/main` in both repos and record exact SHAs.
2. Read `01_OWNER_MASTER_REQUIREMENTS.md` fully.
3. Audit current schema, migrations, contracts, auth, listings, Exchange/Offer, auction, commerce, admin, deployment, V3/UIUX reports.
4. Create `docs/generated/SINGHA_EVOLUTION_CURRENT_TO_TARGET.md`.
5. Repository code overrides stale docs.
6. Preserve proven V3 architecture and transaction-integrity controls.
7. Use additive migrations, compatibility layers, backfills, dual-read/write where needed, and feature flags.
8. Do not mass-replace the word "auction"; change customer/product language semantically.
9. Continue phase-to-phase autonomously. Stop only for owner-only credentials/legal/irreversible production actions.

Public product direction:
- primary brand: **SINGHA**
- optional descriptor: **SINGHA EXCHANGE**
- auction = one precise sale method, not the master platform concept.

Preserve where sound:
Customer/Organization/Asset/Listing, stable IDs, audit/outbox, media provenance, authoritative auction engine, credit/security, commerce ledgers, V3 Flow/UIUX, Discover/Buyer Twin, Engagement, AI safety/routing, Social approval, Intelligence, Live foundations, security controls.

Then execute `15_MASTER_PROMPT_FOR_CLAUDE_CODE.md`.
