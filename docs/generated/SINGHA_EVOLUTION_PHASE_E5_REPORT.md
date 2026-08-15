# SINGHA EVOLUTION — PHASE E5 REPORT (Currency / FX / Display Currency)

**Verdict: E5 PASS** — additive, behind the default-OFF currency flags. Baseline BE `8430f51` →
this phase. The FX capability is built end-to-end; no binding path depends on a live rate yet
(DECISIONS D12), so this ships safely without the owner's FX credential (register O5).

## Delivered

**Contracts** (`@singha/contracts` `fx-domains.ts`) — the currency + FX vocabulary:

- `SUPPORTED_CURRENCIES` (the owner's launch markets LKR/AUD/INR + major settlement currencies)
  with each currency's **minor-unit exponent** (LKR/USD = 2, JPY = 0); `currencyCodeSchema`.
- `fxRateSnapshotSchema` — the immutable snapshot (base, quote, decimal `rate` string, provider,
  quotedAt, expiresAt, marginBps) that travels with any binding calculation (D5).
- `fxConvertRequest`/`fxConvertResponse` — a display conversion, always `binding: false`.

**Pure domain engine** (`@singha/domain` `platform/fx.ts`, 11 tests) — deterministic, **float-free**
money math (D5/D6):

- `parseRateToScaled` — a decimal rate → a 10⁹-scaled integer; rejects malformed / zero / >9 dp.
- `convertMinor` — `amountMinor × rate × 10^quoteExp / 10^baseExp` in exact bigint with **half-up**
  rounding to the quote currency's minor unit; never a float. Handles zero-decimal quotes (JPY) and
  a spread `marginBps`.
- `isRateFresh` / `buildRateSnapshot` — a freshness window + snapshot construction (validates the
  rate before it can persist).

**FX provider adapter** (`apps/api` `modules/fx/fx.provider.ts`) — pack §14 abstraction:

- `FxRateProvider` interface + `FX_PROVIDER` token.
- `FakeFxProvider` — deterministic, credential-free cross rates from a PLACEHOLDER USD table
  (dev/test only), computed in bigint. Bound by default so nothing depends on a live rate.
- `GoogleFxProvider` — the D12 Google-backed adapter, selected only when `FX_API_URL` is configured
  (owner action O5); swap by configuring the endpoint, nothing else changes.

**FX read service + API** (`modules/fx`, flag-gated) — `GET /api/v1/fx/currencies`
(`multiCurrency`), `GET /api/v1/fx/rate` and `GET /api/v1/fx/convert` (`fxDisplay`). Every
conversion is **informational** (`binding: false`) — a display currency never mutates the binding
transaction currency (D5). Rate snapshots persist to the additive `FxRateSnapshot` table and a
fresh one is **reused** (a cache, not a re-quote).

**Schema** — additive `FxRateSnapshot` table; migration `20260815120000_evolution_e5_fx_rate_snapshot`
is a single `CREATE TABLE` + index (**zero** DROP/RENAME/ALTER on existing tables).

**Runtime flags** — `multiCurrency` / `fxDisplay` (default **OFF**) across `@singha/config`
(3 files) + the DB `FeatureFlag` seed. Server-only `FX_API_URL` / `FX_API_KEY` (the key is never
placed in the client-facing provider view).

## Self-review (pack 13)

- **Gates:** `turbo build` 7/7; `typecheck` 13/13; `@singha/domain` **125** tests (11 FX) +
  `@singha/contracts` 25 + `@singha/api` **32** (5 FX service specs) + `@singha/config` 14; `lint`
  **0 errors** (3 pre-existing e2e-script warnings); `format:check` clean. Real-Postgres E2E
  `scripts/e2e-fx.mjs` (wired into `test:fx` + acceptance chain + a CI step) proves the endpoints,
  exact float-free conversion ($100 → 30,000 LKR; LKR→USD round-trips), `binding: false`,
  same-currency identity, currency validation, and snapshot persistence + cache reuse.
- **D5 upheld:** money stays in integer minor units; the display path is explicitly non-binding;
  any rate is snapshotted (base/quote/rate/provider/quotedAt/expiry/margin).
- **D12 upheld:** Google is the source behind a swappable adapter; a credential-free fake supplies
  deterministic rates until the owner confirms the endpoint (O5); **no binding path uses a live
  rate** in E5.
- **Migration safety:** additive-only (new table); existing tables untouched.
- **Deterministic core (D6):** all conversion is pure code; no LLM anywhere near it.

## Owner action (non-blocking)

- **O5 — FX provider endpoint + credentials.** Until confirmed, the fake provider is used and the
  display surfaces stay flag-off; conversion is informational only. Set `FX_API_URL` / `FX_API_KEY`
  to activate the Google adapter — no code change.

## Next

**E6** — Transaction Routing engine + two-layer Terms: resolve operator / terms / payment route /
compliance per transaction (taking origin node + operator as input, Addendum A), the first phase
that will **embed** an FX snapshot when a cross-currency route binds.
