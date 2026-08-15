# SINGHA EVOLUTION — PHASE E1 REPORT (Brand · Language · Neutral IA)

**Verdict: PASS.** Frontend-only, additive, production-safe. The public rebrand ships un-gated;
the geography-neutral navigation ships behind a default-OFF preview flag so nothing incomplete
is exposed. Baseline FE `1172592` → this phase.

## Scope delivered
**A. Brand & language (un-gated — visible in production).** Customer-facing copy moved from
"Singha Auctions / Sri Lanka / auction-as-the-whole-product" to **Singha**, geography-neutral,
multi-method (assets **and** commodities; offers, buy now, tenders, auctions). Touched:
`layout.tsx`, `page.tsx` (hero H1/eyebrow/sub-copy/metadata), `Footer.tsx`, `Header.tsx` +
`MobileNav.tsx` (aria), `BrandLogo.tsx` (+ its test), `how-it-works`, `terms`, `account`,
`live`. "Auction" language kept only where the sale is genuinely an auction.

**B. Geography-neutral IA (flag-gated `neutralIaV1`).** New primary nav **Explore · Exchange ·
Sell · Wanted · Services** (`lib/nav.ts` `NEUTRAL_NAV_ITEMS`), selected in `Header`/`MobileNav`
when the flag is on. A dedicated **Evolution preview channel** (`?evo=on` / cookie
`singha_evo_preview` / `NEXT_PUBLIC_EVO_PREVIEW`) was added in `flags.ts` + `use-flags.ts`,
separate from the V3 visual preview so the program can grow phase by phase. Three editorial
landing pages added — `/exchange`, `/wanted`, `/services` — honest explainers that route into
real surfaces and expose no unbuilt functionality.

**C. Language glossary + guard.** `SINGHA_EVOLUTION_LANGUAGE_GLOSSARY.md` (prefer/avoid rules)
and a build-enforced guard test (`language-glossary.test.ts`, 8 checks) that fails if a banned
phrase — Global Marketplace, Singha Global, Auction Account/Shipping, Worldwide, … — reappears
in customer-facing source.

## Self-review (pack 13)
- **Hydration:** the flag is client-only (cookie), so the nav swap first produced a hydration
  mismatch under `?evo=on`. Fixed with a mount gate in `Header` (server + first client render
  agree; production keeps the default nav with no flash) — verified **0** hydration/pageerror
  messages via headless console capture on both production and preview paths.
- **Format / typecheck / tests / build:** prettier clean; `tsc --noEmit` clean; **69/69** unit
  tests pass (61 prior + 8 new guard); `next build` succeeds with `/exchange`, `/wanted`,
  `/services` prerendered static.
- **Production safety:** default (flag-off) nav and routes unchanged; no API/route renames, no
  broken links, no audit/SEO-structural changes. Only public copy changed (intended rebrand).
- **A11y/responsive:** nav is a real `<Link>` list with `aria-current`; editorial pages use the
  existing responsive shell and design tokens; palette/CSP untouched.
- **Secrets:** none.

## Limitations / follow-ups
- Neutral IA is preview-only until the commerce it points at matures (Exchange/Wanted through
  E4/E9); Dashboard/Live/Events remain reachable via account menu, home and Exchange surfaces.
- Legal entity naming on invoices/terms stays owner-gated (register O1), surfaced in E6.
- `sell/new` still carries a locally-listed sale-method set; unifying the sale-method taxonomy
  onto `SaleMethodDefinition` is E2/E3 work.

## Next
**E2 — config foundations:** `Operator`, `Market/Jurisdiction`, `Location` (roles),
`UnitDefinition`, `SaleMethodDefinition`, and the `MarketNode` concept (Addendum A). Additive,
flag-off, backend-led.
