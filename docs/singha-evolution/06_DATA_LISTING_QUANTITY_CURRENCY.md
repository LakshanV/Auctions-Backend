# DATA / UNIVERSAL LISTING / QUANTITY / CURRENCY

## Additive target concepts
Operator; Market/Jurisdiction; Location; UnitDefinition; SaleMethodDefinition; FXQuote; OfferRevision; LogisticsMethod; Port/Airport/Depot; LogisticsProvider; Route; LogisticsQuote; Shipment; RuleVersion; ProcurementRequest; SupplierProposal; SupplyProgramme.

## Universal Listing
Keep current Asset + Listing split.
Every listing should answer:
- what is sold
- quantity + unit
- seller/owner/custodian
- location/pickup/export origin
- operator
- sale method
- transaction currency
- price/offer state
- shipping/pickup
- documents/specs/terms
- validity/closing window.

Category-specific data stays in versioned category schemas.

Vehicle: VIN/chassis, make/model/year, mileage, damage/status, run condition, keys, export suitability.
Produce: harvest/pack/expiry, grade, variety, size/moisture, cold chain/temp, packing, certificates, shipment window.
Scrap: material/grade/weight/contamination/processing/loading.
Gem: species/variety/carat/dimensions/colour/treatment/origin/lab/certificate/custody/passport.
Machinery/property: specialist schemas without polluting generic core.

## Quantity
Use database Decimal, not JS float.
Support available/min/max/requested/awarded quantity, partial-quantity policy and lot-only policy.

Units configurable: each, lot, kg, g, tonne/MT, litre, m3, m2, acre, perch, carat, bag, pallet, container, piece, bundle, vehicle, machine and future units.

## Pricing
Support total lot, per-unit, tiered, offers invited and guide/indicative.
Represent unambiguously: amount + currency + pricing basis + unit + quantity.

## Currency/FX
Transaction Currency is binding.
Display Currency is informational preference.
Changing display currency MUST NOT mutate contractual currency.

FX adapter result records:
base, quote, rate, provider, quotedAt, expiresAt/staleness, margin.
Cache responsibly; snapshot any rate used in a binding calculation.
Continue integer minor units for fiat money.
