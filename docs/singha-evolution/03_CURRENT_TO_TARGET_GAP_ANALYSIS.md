# CURRENT → TARGET GAP ANALYSIS

Decision order:
KEEP → EXTEND → WRAP → MIGRATE → RETIRE.

| Current | Target | Strategy |
|---|---|---|
| Customer | Singha ID | EXTEND |
| Organization | business/seller org | KEEP/EXTEND |
| Asset | enduring physical item/stock | KEEP |
| Asset.attributes | category schemas | KEEP/formalize |
| Listing | market exposure | KEEP/EXTEND |
| fixed SaleMethod enum | configurable method definitions | ADDITIVE MIGRATION |
| Auction | specialist mechanism | KEEP behind neutral interface |
| Offer | full commercial proposal | EXTEND with immutable revisions |
| TenderBid | legacy sealed path | WRAP/MIGRATE |
| Sale | awarded commercial outcome | KEEP/broaden metadata |
| flat location strings | structured location roles | ADD + backfill |
| no Operator | legal/local routing operator | ADD |
| listing currency only | transaction + display FX | EXTEND |
| no quantity/unit | quantity/unit/pricing basis | ADD |
| no procurement | RFQ/Wanted/Reverse Tender | ADD |
| no supply programmes | recurring supply | ADD |
| Buyer Twin | broader buyer/supplier intelligence | EXTEND |

## Critical semantic correction
New sealed offers default to `MANUAL_SELECTION`.
Highest value does not bind automatically unless an explicit preconfigured policy says `AUTO_HIGHEST` and that policy is permitted for that operator/event.

## Sale method migration
Do not grow a PostgreSQL enum forever.
Preferred safe path:
1. add `sale_method_definition`;
2. add compatible `listing.sale_method_code` string/FK;
3. seed old values;
4. backfill;
5. dual read/write if needed;
6. switch contracts;
7. retire old enum only in a later proven-safe migration.

## Offer migration
Use `Offer` + immutable `OfferRevision` + append-only events.
A counter creates a new revision; never overwrite prior commercial terms.
