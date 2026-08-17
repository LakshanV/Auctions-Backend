# SINGHA — Remaining Work Open Items (owner / provider / legal-gated)

Engineering cannot close these. Each has the exact owner action. Ordered by pilot-blocking value.

## OWNER_ONLY — GitHub / account configuration

**SEC-4 (highest — unblocks all CI): Clear the GitHub Actions billing lock.**
CI, CodeQL and Gitleaks currently return `BLOCKED_EXTERNAL_ACCOUNT` (spending limit), so no workflow
runs on push. Action: in GitHub → Settings → Billing, raise/enable the Actions spending limit for the
account owning `LakshanV/Auctions-Backend` and `MUA1234/Auctions-New`, then re-run the latest workflows.
Until then, treat local gate runs (this session) as the source of truth for green.

**SEC-1: Make both repositories private.** Settings → General → Danger Zone → Change visibility →
Private, for both repos. (Highest-value anti-clone action; architecture already assumes it.)

**SEC-2: Protect `main`.** Settings → Branches → add a rule for `main`: require PR, require status
checks to pass (CI, CodeQL, Gitleaks), dismiss stale approvals, block force-push and deletion. Both repos.

**SEC-3: Enable GitHub Advanced Security.** Secret scanning + push protection, Dependabot alerts +
security updates, CodeQL default setup. Both repos.

## PROVIDER_GATED — credentials/accounts required (frameworks + fakes already built)

- **PRV-1 AI vision model** — real vision provider key; the `VisionIntelligenceProvider` port + fake are engineering-built (RW2). Bind the real impl by config; no other change.
- **PRV-2 external providers** — payments (regulated PSP), live FX, logistics carriers + port master data, WhatsApp/Meta, voice/telephony, video streaming (YouTube/IVS). Ports + deterministic fakes exist; supply credentials and flip the binding/flag.
- **PRV-3 GSI / gem-lab certification** — integration account for verified gem certificates (linked, never inferred from photos).

## LEGAL_GATED — O1–O8 (unchanged; do not bypass)

- **O1** legal operator entity + customer terms; **O2** auction licensing; **O3** tax/VAT/GST rules;
  **O4** regulated payment providers; **O5** live FX provider/licence; **O6** logistics providers + port
  master data; **O7** KYC/licence requirements; **O8** public rollout / DNS / hosting / final approval.
- Engineering has built the frameworks/adapters and keeps binding behaviour behind flags
  (`operatorPayments`, `logisticsQuotes`, `feesEngine` preview, etc.). Binding public production use waits
  on verified owner configuration.

## Deployment / verification (owner-visible)

- Push `claude/new-session-at0qp4` → open PRs → merge to `main` in both repos when ready (this programme
  develops on the branch; PRs are opened on request).
- After SEC-4 is cleared, confirm Vercel (`@singha/web`) and Railway (`Auctions-Backend`) build the merged
  SHAs green with security headers live.

## Non-blocking follow-ups

- Physically remove the frozen FE `apps/api`+`apps/worker` (code-side; being handled in RW10).
- Nonce-based CSP to drop `unsafe-inline` for Next hydration (documented follow-up).
- Vercel/Railway WAF enablement.
