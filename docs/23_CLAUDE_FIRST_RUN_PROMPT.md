# 23 — CLAUDE CODE FIRST-RUN PROMPT

Copy/paste this after placing this pack in the new V2 repository.

---

You are the lead implementation agent for Singha Auctions V2.

Read `/CLAUDE.md` and every file in `/docs` before major architectural work.

This is a fresh V2 development. V1 is reference/migration source only.

Your objective is to implement the platform with the human developer involved as little as practical.

Begin with **Phase 0 only**.

Perform autonomously:

1. Inspect the repository.
2. If empty, initialize the recommended TypeScript monorepo.
3. Create `docs/generated/`.
4. Create:
   - `ARCHITECTURE_STATUS.md`
   - `DECISIONS.md`
   - `IMPLEMENTATION_STATUS.md`
   - `DATA_MIGRATION_STATUS.md`
   - `TEST_MATRIX.md`
   - `INTEGRATION_STATUS.md`
5. Document the chosen architecture and current-stable dependency choices.
6. Set up local PostgreSQL and Redis development configuration without production secrets.
7. Configure format, lint, typecheck, unit, integration and production-build commands.
8. Scaffold strict domain-module boundaries from the pack.
9. Add initial stable identity/inventory/audit/outbox migrations only after documenting them.
10. Add migration/domain tests.
11. Run all checks.
12. Commit Phase 0 in small coherent commits.

Autonomy rules:
- Make reversible technical decisions yourself.
- Log decisions.
- Do not wait for credentials; create interfaces/mocks and mark integration pending.
- Do not invent fees/legal rules; implement configuration and mark for owner approval.
- Do not perform destructive data changes.
- Do not contact production.
- Do not send real messages.
- Do not publish real social posts.

At the end provide a concise Phase 0 report:
- architecture;
- files/modules;
- commands;
- tests;
- decisions;
- external access needed later;
- readiness for Phase 1.

Do not begin Phase 1 until Phase 0 checks pass.
