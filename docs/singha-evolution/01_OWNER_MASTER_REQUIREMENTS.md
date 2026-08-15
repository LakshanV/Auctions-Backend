# REVISED MASTER INSTRUCTION — SINGHA PLATFORM

We have already developed the existing Singha website and backend.

I now want to evolve that existing platform into a **geography-neutral, multi-market asset and commodity platform** without rebuilding completed work unnecessarily.

Please first inspect the latest state of both existing repositories and then create the **Full Autonomous AI Development Pack for Claude Code** required to implement the changes.

## Existing repositories

**Frontend:**
`MUA1234/Auctions-New`

**Backend:**
`LakshanV/Auctions-Backend`

Use the latest `origin/main` from both repositories as the source of truth.

Do not work from assumptions or older architecture documents where the repositories differ.

This is a continuation of the existing Singha development, not a new website.

---

# 1. BRAND DIRECTION

The master public brand should primarily be:

# SINGHA

Do not repeatedly use:

- Global
- International
- Worldwide
- Global Marketplace
- Singha Global

The platform should feel naturally capable of operating across countries without repeatedly announcing that fact.

Where a descriptive marketplace name is useful, use:

# SINGHA EXCHANGE

The word **Auction** should now be used in a much more limited and precise manner.

An auction is only **one selling mechanism available through Singha**.

Do not position every activity, listing, page or transaction as an auction.

The existing business/legal name **Singha Auctions** may continue where required, but the customer-facing product should increasingly use:

**Singha**

and, where appropriate:

**Singha Exchange**

---

# 2. THE WORD “AUCTION”

Use **Auction** only where an actual auction is taking place.

For example:

### Correct

Timed Auction

Live Auction

Auction closes at 7:00 PM

Auction Results

Auction Terms

### Avoid

Global Auction Marketplace

Auction Exchange

Auction Account

Auction Shipping

Auction Offer

Auction Catalogue

when the function has nothing specifically to do with an auction.

At software/domain level, do not architect the core platform around auctions.

Auction should be a value within a broader:

`SALE_METHOD`

or equivalent domain.

Potential sale methods include:

- BUY\_NOW
- NEGOTIATED\_SALE
- MAKE\_OFFER
- PRIVATE\_OFFER
- SEALED\_OFFER
- FLASH\_OFFER
- TENDER
- RFQ
- REQUEST\_SUPPLY
- REVERSE\_TENDER
- EOI
- CLASSIFIED
- AUCTION
- PREMIER\_AUCTION

---

# 3. PLATFORM VISION

The existing main Singha website becomes the principal Singha platform.

It should support:

## Assets

- vehicles
- salvage vehicles
- damaged vehicles
- machinery
- industrial equipment
- agricultural machinery
- property
- land
- business assets
- liquidation inventory
- surplus inventory
- government/corporate disposals
- gems
- jewellery
- collectibles
- general goods

## Commodities

- onions
- vegetables
- fruit
- spices
- grains
- agricultural produce
- wholesale goods
- raw materials
- scrap metal
- recyclables
- bulk stock
- container loads
- industrial commodities
- recurring supply

and future asset or commodity classes.

Do not design Singha primarily around gems, vehicles or auctions.

The core architecture must be **category neutral**.

---

# 4. SINGHA EXCHANGE

Use **Singha Exchange** where we need a natural name for the broader commercial marketplace.

Singha Exchange can support:

- offers
- wholesale trade
- commodities
- tenders
- RFQs
- procurement
- recurring supply
- buyer requirements
- private sales
- Buy Now
- auctions where appropriate

The customer may simply browse **Singha** most of the time.

“Exchange” should be used when it adds clarity rather than forced into every screen.

---

# 5. GEOGRAPHY-NEUTRAL MAIN SITE

The main Singha site should not look like:

- a Sri Lankan marketplace
- an Australian marketplace
- an Indian marketplace
- a Mauritian marketplace

It should simply be:

# SINGHA

Customers should naturally encounter inventory from different locations.

For example:

### BMW X5 Salvage

AUD 18,500

📍 Melbourne, Australia

International shipping available

**MAKE OFFER**

---

### Red Onions — 25 MT

USD 390 / MT

📍 Tamil Nadu, India

FOB Chennai

CIF quotation available

**SUBMIT OFFER**

---

### Ceylon Sapphire — 8.72 ct

Offers Invited

📍 Sri Lanka

Secure international shipping available

**MAKE OFFER**

Nothing needs to be labelled “Global”.

The inventory itself communicates the international nature of the platform.

---

# 6. LOCAL SINGHA OPERATIONS

We already have or intend to operate businesses in:

- Sri Lanka
- Australia
- India

and later potentially:

- Mauritius
- UAE
- Singapore
- UK
- Japan
- South Africa
- New Zealand
- other markets

These should not automatically be modelled as legal “branches”.

Use the generic architecture:

# OPERATOR

An operator may legally be:

- company
- subsidiary
- sister company
- trading business
- custodian
- agent
- representative
- marketplace operator
- local service company

depending on the country and transaction.

Do not hardcode corporate legal structures into the software.

---

# 7. LOCAL WEBSITES

We may create local Singha websites for markets such as:

Sri Lanka

Australia

India

These should primarily handle:

- local marketing
- SEO
- local seller acquisition
- local campaigns
- local-language content
- local services
- local contact details
- office information
- local regulatory information

They should not duplicate the complete marketplace.

Example:

Singha Australia local site

→ Browse Salvage Vehicles

→ routes customer into the main Singha platform

→ automatically filtered to Australian salvage inventory.

India:

→ Wholesale Produce

→ opens the main Singha platform

→ filtered to relevant Indian supply.

Sri Lanka:

→ Browse Assets

→ main Singha platform

→ filtered to assets located in Sri Lanka.

The principal marketplace inventory remains central.

---

# 8. LEGAL OPERATOR ROUTING

Although customers experience one Singha platform, the backend must know which legal/local operator handles each transaction.

Every transaction should consider:

1. Asset location
2. Seller location
3. Buyer location
4. Custodian
5. Listing operator
6. Transaction operator
7. Sale method
8. Transaction currency
9. Payment route
10. Pickup location
11. Export origin
12. Destination
13. Shipping method
14. Applicable legal/compliance rules

Create a configurable:

# TRANSACTION ROUTING ENGINE

Do not hardcode countries directly into business logic where configuration can be used instead.

---

# 9. CUSTOMER-FACING LEGAL DISCLOSURE

The customer should not need to understand the corporate structure simply to browse Singha.

Only surface local entity information where relevant.

For example:

> Transaction handled by Singha Auctions Australia Pty Ltd.

or:

> Local sale and collection handled by Singha Auctions Sri Lanka.

or equivalent configured wording.

Invoices, contracts, payment instructions and transaction terms should identify the correct legal entity.

The master Singha branding remains consistent.

---

# 10. TWO-LAYER TERMS ARCHITECTURE

Support:

## Platform Terms

Cover use of:

- Singha
- Singha ID
- website
- account
- technology
- communications
- platform services
- data/privacy
- general platform rules

The final legal contracting entity should remain configurable.

Do not hardcode an assumption before legal review.

## Transaction Terms

Specific to:

- operator
- country
- asset
- sale method
- seller
- buyer
- shipping
- payment
- local regulations

---

# 11. SINGHA ID

Create one customer identity:

# SINGHA ID

Do not require customers to register separately for Sri Lanka, Australia, India or other markets.

One account should contain:

- profile
- contact details
- country
- preferred currency
- language
- timezone
- company information
- KYC
- dealer licences if required
- seller verification
- bidder verification
- watchlist
- offers
- bids
- purchases
- sales
- logistics
- invoices
- documents
- notifications
- transaction history

Additional verification may be requested only when required for a specific activity.

---

# 12. UNIVERSAL LISTING / LOT MODEL

Do not create core models such as:

`gem_listing`

`vehicle_offer`

`auction_product`

for concepts that should be universal.

Core concepts should be generic:

- listing
- lot
- asset
- commodity
- offer
- transaction
- sale\_event
- operator
- location
- shipment
- fee
- document

Then extend through category-specific schemas.

Every listing should fundamentally answer:

- What is being sold?
- What quantity?
- Where is it?
- Who owns/sells it?
- Who controls/custodies it?
- Which operator handles it?
- How is it being sold?
- What currency?
- How can it be collected?
- Can it be shipped?
- From where?
- To where?
- What documents/specifications apply?

---

# 13. QUANTITY AND UNIT ENGINE

This is now core functionality.

Support different units such as:

- each
- lot
- kg
- tonne / metric tonne
- gram
- carat
- litre
- cubic metre
- square metre
- acre
- perch
- bag
- pallet
- container
- piece
- bundle
- vehicle
- machine

and future units.

Support:

**price per unit**

and/or:

**total lot price**

Examples:

USD 390 / MT

AUD 18,500 / vehicle

USD 2,500 / carat

USD 22,000 / lot

Do not hardcode unit behaviour by category.

---

# 14. MULTI-CURRENCY

Support architecture for currencies including:

- USD
- LKR
- AUD
- INR
- EUR
- GBP
- AED
- SGD

and future currencies.

Distinguish:

## Transaction Currency

The actual contractual currency.

## Display Currency

The customer's preferred reference currency.

Example:

**AUD 18,500**

≈ **USD 12,200**

Conversion is informational unless specifically configured otherwise.

FX data should record:

- source currency
- target currency
- rate
- provider
- timestamp
- margin if any

Build an abstract FX provider layer.

---

# 15. LOCATION MODEL

Location must become a first-class structured concept.

Distinguish:

### Asset Location

Where the asset physically exists.

### Seller Location

Where the seller is based.

### Custodian Location

Where appropriate.

### Pickup Location

Where the buyer collects.

### Export Origin

Where international shipment begins.

### Destination

Where goods are going.

Do not assume these are the same.

---

# 16. LOGISTICS

Logistics should become a major platform domain.

Support category-dependent options such as:

### Vehicles

- pickup
- towing
- inland transport
- RoRo
- container
- shared container

### Machinery

- road haulage
- container
- flat rack
- breakbulk
- RoRo

### Produce

- truck
- refrigerated transport
- container
- reefer
- air freight
- sea freight

### Scrap

- container
- bulk
- loading
- weighing
- dismantling
- processing

### Gems

- secure courier
- insured courier
- air shipment
- collection

### General goods

- courier
- parcel
- pallet
- LCL
- FCL

---

# 17. SHIPPING AND PORTS

Build structured entities for:

- ports
- airports
- inland depots
- shipping methods
- routes
- logistics providers
- pickup locations

Support:

- origin port
- destination port
- shipping method
- buyer-arranged shipping
- seller-arranged shipping
- Singha-arranged shipping
- quote required
- instant estimate where available

Do not hardcode ports into listings.

---

# 18. INCOTERMS / TRADE TERMS

For commodity and international trade support configurable commercial terms such as:

- EXW
- FCA
- FOB
- CFR
- CIF
- DAP

and additional Incoterms where required.

Example:

**Indian Red Onion**

USD 390 / MT FOB Chennai

or:

USD 455 / MT CIF Colombo

The architecture should allow different offers to contain different trade terms.

---

# 19. OFFER SYSTEM — VERY HIGH PRIORITY

The Offer System should be one of the highest development priorities.

Build it as a separate domain from auctions.

Support:

### Make Offer

Simple negotiated offer.

### Private Offer

Confidential price.

### Sealed Offer

Multiple buyers submit confidential offers.

### Flash Offer

Short defined offer period.

### Best Offer

Seller receives competing confidential proposals.

For applicable transactions, an offer may contain more than price.

For commodities:

- unit price
- quantity
- Incoterm
- destination
- delivery date
- payment terms
- shipping requirement

Example:

Buyer A:

USD 410 / MT
50 MT
CIF Colombo
Delivery 30 August

Buyer B:

USD 425 / MT
20 MT
FOB Chennai
Immediate collection

The seller must be able to compare the entire commercial proposal.

---

# 20. SEALED OFFER

Participants must not see competing prices.

Display information such as:

**12 verified buyers participating**

**6 offers received**

without revealing prices.

When the offer window closes, authorised seller/admin can see ranked proposals.

Actions:

- Accept
- Counter
- Reject
- Extend
- Negotiate
- Change sale method
- Send to auction

Highest offer should not automatically create a binding sale unless specifically configured.

Maintain full audit history.

---

# 21. AUCTION ENGINE

Preserve the existing auction engine where sound.

Do not remove auctions.

Instead reposition them as **one specialist transaction mechanism**.

Support:

- timed auctions
- live auctions where appropriate
- extensions
- reserves
- bidder verification
- buyer premiums
- seller fees
- auction-specific terms
- jurisdiction/operator eligibility

Auction functionality should only become available when applicable rules/permissions are satisfied.

Use configuration such as:

`SALE_METHOD_ELIGIBILITY`

rather than assuming auctions are permitted everywhere.

---

# 22. TENDERS, RFQ AND PROCUREMENT

Singha Exchange should support buyers as well as sellers.

Create architecture for:

### RFQ

Buyer requests quotations.

### Request Supply

Example:

> Wanted: 200 MT Red Onion
> Monthly delivery: 50 MT
> Destination: Colombo

Suppliers submit offers.

### Reverse Tender

Suppliers compete to supply at the best commercial terms.

### Procurement Events

Companies/government/large buyers request goods.

This creates a two-sided market:

**I HAVE SOMETHING TO SELL**

and:

**I NEED SOMETHING TO BUY**

---

# 23. RECURRING SUPPLY

Support commodity suppliers who have continuing availability.

Example:

Red Onion

Tamil Nadu

100 MT/month

Minimum order: 10 MT

Available weekly

Instead of repeatedly creating identical listings, allow:

# SUPPLY PROGRAMMES

Potential fields:

- product
- origin
- available quantity
- frequency
- minimum order
- maximum order
- pricing basis
- packing
- quality
- shipping terms
- validity period

---

# 24. PERISHABLE GOODS

Agricultural/food listings need specialist metadata.

Support:

- harvest date
- packing date
- expiry/best-use date
- variety
- grade
- size
- moisture
- quality specifications
- cold chain
- temperature requirements
- packing
- phytosanitary certificate
- origin certificate
- available quantity
- minimum quantity
- shipment window

Listings should support automatic expiry where appropriate.

---

# 25. CATEGORY MODULES

Use strong common core fields plus specialised category schemas.

Examples:

## Vehicle Module

- VIN/chassis
- make/model
- year
- mileage
- title/status
- damage
- start/run condition
- keys
- write-off information
- export suitability

## Scrap Module

- material
- grade
- estimated weight
- contamination
- processing state
- loose/baled
- loading requirements

## Agriculture Module

as above.

## Gem Module

- species
- variety
- weight
- dimensions
- colour
- treatment
- origin
- lab
- certificate
- media
- custody
- digital passport

## Machinery Module

appropriate industrial specifications.

## Property Module

appropriate property-specific data.

Do not contaminate the generic platform domain with category-specific terminology.

---

# 26. LISTING UX

Listing cards should clearly communicate:

- title
- price / offer state
- location
- quantity
- unit
- sale method
- shipping/pickup
- closing time where relevant

Example:

### Red Onions — Grade A

**USD 390 / MT**

25 MT available

📍 Tamil Nadu, India

FOB Chennai

**MAKE OFFER**

---

### BMW X5 Salvage

**AUD 18,500**

📍 Melbourne, Australia

Export available

**TIMED AUCTION**

---

### Ceylon Sapphire — 8.72 ct

📍 Sri Lanka

Offers Invited

**SUBMIT OFFER**

---

# 27. ITEM PAGE

Every listing should answer:

**What is it?**

**How much is available?**

**Where is it?**

**What currency?**

**How is it being sold?**

**Can I buy it?**

**Can I make an offer?**

**Can I bid?**

**Can it ship to me?**

**Where can I collect it?**

**Which port does it ship from?**

**Who arranges freight?**

**Which Singha operator handles the transaction?**

Keep this information clear without creating a cluttered interface.

---

# 28. PAYMENT ORCHESTRATION

One customer experience, multiple settlement routes.

Depending on the transaction:

Sri Lankan transaction → Sri Lankan account/provider

Australian transaction → Australian account/provider

Indian transaction → Indian account/provider

future operator → configured settlement route.

Do not create an unlicensed internal bank or informal escrow service.

Use proper regulated providers.

Separate:

- principal transaction amount
- buyer premium
- seller commission
- platform fee
- freight
- taxes
- certification
- documentation
- storage
- other charges

---

# 29. FEE ENGINE

Make fees configurable.

Possible fees:

- buyer premium
- seller commission
- listing fee
- platform fee
- auction fee
- offer fee
- logistics fee
- inspection
- storage
- export administration
- documentation
- certification

Rules may vary by:

- operator
- country
- category
- seller
- buyer
- sale method
- transaction value

Never hardcode commercial rates unless technically unavoidable.

---

# 30. TAX / RULES ENGINE

Tax and legal configuration should be data-driven.

Rules may depend on:

- jurisdiction
- operator
- asset type
- transaction type
- seller location
- buyer location
- domestic/export
- sale method

Do not expect developers to rewrite application logic every time a tax rule changes.

Version rules and record which version was used for each transaction.

---

# 31. CUSTOMER DASHBOARD

One chronological/customer-centric dashboard.

### Buying

Watching
Offers
Counters
Active bids
Won
To Pay
Paid
Shipping
Pickup
Completed

### Selling

Draft
Pending
Live
Offers
Tenders
Auctions
Sold
Settlement

### Procurement

RFQs
Supplier responses
Tenders
Orders

### Logistics

Quotes
Booked
In Transit
Ready
Delivered

### Documents

Invoices
Receipts
Contracts
Certificates
Shipping documents
Export documents

Avoid unnecessarily separating the customer's activity into disconnected systems.

---

# 32. ADMIN / SINGHA CONTROL CENTRE

Create management areas for:

- Operators
- Markets
- Locations
- Currencies
- FX
- Ports
- Shipping Methods
- Logistics Quotes
- Sale Methods
- Offers
- Auctions
- Tenders
- RFQs
- Supply Programmes
- Categories
- Units
- Fees
- Tax Rules
- Compliance Rules
- Users
- KYC
- Content
- SEO
- Audit Logs

---

# 33. SEO AND LOCAL SITES

Ensure the architecture avoids duplicate content.

Use:

- canonical URLs
- hreflang where appropriate
- country/location landing pages
- category landing pages
- structured data
- international sitemap architecture

The same listing should generally not have separate duplicated URLs solely because a viewer selects another currency.

---

# 34. MARKET/CURRENCY EXPERIENCE

Do not use a prominent:

**GLOBAL**

market selector.

Prefer:

### Location

**All Locations**

Sri Lanka

Australia

India

etc.

Currency selector may appear separately.

Example:

**USD ▾**

Do not force customers into a geographical silo based on IP/geolocation.

Location can provide sensible defaults but users must remain free to browse everything.

---

# 35. HOMEPAGE

The homepage should increasingly use:

# SINGHA

rather than repeatedly:

Singha Auctions

Do not use:

“Global Marketplace”

or other exaggerated wording.

The site should feel premium, modern, understated and established.

Potential navigation direction:

**Explore**

**Exchange**

**Sell**

**Wanted**

**Services**

The exact UX can be improved after reviewing the current implementation.

“Auctions” can remain available where actual auction inventory needs to be accessed, but should not dominate the whole product.

---

# 36. PRODUCT LANGUAGE

Prefer:

**Make Offer**

**Submit Offer**

**Trade Offer**

**Tender**

**Request Quote**

**Request Supply**

**Buy Now**

**Timed Auction**

only where appropriate.

Avoid adding “auction” to functions that are not auctions.

---

# 37. AI

Provide future-ready extension points for AI:

### Listing AI

Extract and generate listing information.

### Buyer/Supplier Matching

Match inventory to likely buyers.

Match procurement requests to likely suppliers.

### Offer Intelligence

Help seller compare:

- price
- quantity
- buyer history
- payment terms
- delivery
- logistics

### Logistics Intelligence

Recommend shipping methods/routes.

### Pricing Intelligence

Analyse comparable sales/offers.

### Fraud/Risk

Identify unusual behaviour.

Use deterministic code rather than LLM calls where AI is unnecessary.

---

# 38. ANTI-CLONE / IP PROTECTION

Continue the strong anti-clone architecture already planned.

Protect proprietary:

- transaction routing
- buyer matching
- supplier matching
- offer ranking
- pricing intelligence
- logistics intelligence
- fraud models
- recommendation engines
- commercial rules

Keep valuable logic server-side wherever practical.

Include:

- API protections
- abuse detection
- source-map controls
- secrets isolation
- rate limiting
- signed operations
- audit logs
- monitoring
- appropriate copyright/licence controls

---

# 39. SECURITY

Implement strong:

- RBAC
- operator-level permissions
- MFA for administrators
- KYC protection
- offer confidentiality
- bidder confidentiality
- reserve-price protection
- secure uploads
- signed URLs
- webhook verification
- payment idempotency
- rate limiting
- dependency scanning
- vulnerability scanning
- secrets management
- secure logging
- backups
- disaster recovery

---

# 40. CLAUDE CODE AUTONOMY

Create this as a:

# FULL AUTONOMOUS AI DEVELOPMENT PACK FOR CLAUDE CODE

The human developer should need minimal involvement in routine implementation.

Claude should autonomously:

- inspect repositories
- plan changes
- implement
- migrate database
- generate tests
- run tests
- review its own work
- fix failures
- document changes
- prepare deployment
- prepare rollback

Developer involvement should primarily be limited to:

- credentials
- external accounts
- secrets
- production access
- unresolved legal decisions
- payment-provider setup
- final production approval

---

# 41. CLAUDE USAGE AND COST OPTIMISATION

Include automatic model-routing instructions.

Use cheaper/faster Claude capability for:

- repository exploration
- repetitive code changes
- CRUD
- tests
- documentation
- formatting

Use strongest reasoning capability selectively for:

- architecture
- database design
- auction/offer concurrency
- transaction routing
- payment logic
- security-critical work
- difficult migrations
- complex debugging

After solving the difficult section, de-escalate again.

Avoid unnecessarily loading the entire repository repeatedly.

Use targeted files, summaries and persistent implementation documents.

---

# 42. REPOSITORY AUDIT FIRST

Before producing final implementation instructions:

1. Fetch latest `origin/main` from both repositories.
2. Audit existing frontend.
3. Audit existing backend.
4. Audit database.
5. Audit auth.
6. Audit listing system.
7. Audit offer functionality.
8. Audit auction engine.
9. Audit admin.
10. Audit payments.
11. Audit deployment.
12. Identify completed V3 functionality.
13. Identify partially completed work.
14. Identify reusable architecture.
15. Identify technical debt.

Then produce:

# CURRENT STATE → TARGET STATE GAP ANALYSIS

Do not recommend replacing working systems merely because another architecture would be easier to build from scratch.

---

# 43. DATA-DRIVEN ARCHITECTURE

Where possible, adding another country/operator/category should involve configuration rather than new business logic.

Avoid:

```
if country == "Sri Lanka"

```

Prefer configurable:

- operator rules
- jurisdiction rules
- sale method rules
- fee rules
- tax rules
- logistics rules
- compliance rules

Likewise, adding a new category should rely on reusable schema architecture rather than database redesign.

---

# 44. TESTING

Provide comprehensive:

- unit tests
- integration tests
- API tests
- E2E tests
- migration tests
- security tests
- regression tests
- concurrency tests

Especially test:

### Offers

confidentiality
counteroffers
expiry
seller acceptance
concurrent submissions

### Auctions

bid integrity
extensions
reserve
concurrency

### Multi-currency

conversion
precision
stale FX

### Quantity

unit pricing
partial quantities
lot pricing

### Routing

SL → SL
SL → AU
IN → SL
AU → IN
etc.

### Logistics

pickup
domestic
international
ports
quotes

### Operator Security

ensure one operator cannot improperly access another operator's protected data.

---

# 45. SELF-REVIEW GATES

Claude must not simply state that a phase is completed.

After every phase:

1. Review diff.
2. Run tests.
3. Run lint.
4. Run type checks.
5. Check migrations.
6. Check security.
7. Check accessibility.
8. Check responsive design.
9. Check performance.
10. Check auditability.
11. Check for secrets.
12. Fix identified issues.

Then produce an evidence-based phase completion report.

---

# 46. FEATURE FLAGS

Use feature flags for significant functionality.

Potential examples:

- MULTI\_CURRENCY
- MULTI\_OPERATOR
- SEALED\_OFFERS
- COMMODITY\_TRADING
- RFQ
- REQUEST\_SUPPLY
- LOGISTICS\_QUOTES
- ROUTING\_ENGINE
- INTERNATIONAL\_CHECKOUT
- AUCTION\_ROUTING

Do not expose incomplete functionality publicly.

---

# 47. DEPLOYMENT

Respect existing deployment architecture unless there is a strong documented reason to change it.

Provide for every phase:

- migrations
- environment variables
- feature flags
- staging validation
- smoke tests
- production rollout
- monitoring
- rollback

---

# 48. REQUIRED OUTPUT FROM THIS CHAT

Do not immediately begin making random code changes.

First inspect both repositories.

Then create the:

# FULL AUTONOMOUS AI DEVELOPMENT PACK — SINGHA

The package should include:

1. Executive vision
2. Repository audit
3. Current-state architecture
4. Gap analysis
5. Target product architecture
6. Target frontend architecture
7. Target backend architecture
8. Database architecture
9. Universal listing model
10. Category module architecture
11. Quantity/unit engine
12. Multi-currency
13. Location model
14. Operator model
15. Transaction routing
16. Offer engine
17. Auction integration
18. Tender/RFQ/procurement
19. Commodity/supply architecture
20. Logistics/ports/shipping
21. Payment orchestration
22. Fee engine
23. Tax/rules engine
24. Singha ID
25. Dashboard
26. Admin/Control Centre
27. Local-site integration
28. SEO/localisation
29. Security
30. Anti-clone/IP
31. AI extensions
32. Testing
33. Self-review process
34. Deployment
35. Rollback
36. Claude model/cost optimisation
37. Phased autonomous implementation plan
38. Acceptance criteria for every phase
39. Final executable Claude Code master instructions

---

# 49. FINAL PRODUCT PRINCIPLE

The final system should be understood as:

## ONE MASTER BRAND

# SINGHA

## ONE PRINCIPAL PLATFORM

The existing Singha website.

## ONE OPTIONAL MARKETPLACE DESCRIPTOR

# SINGHA EXCHANGE

used where commercially useful.

## ONE CUSTOMER IDENTITY

# SINGHA ID

## MANY TYPES OF COMMERCE

Offers

Sales

Tenders

Procurement

RFQs

Recurring supply

Auctions

## MANY ASSET CLASSES

Produce

Commodities

Scrap

Salvage

Vehicles

Machinery

Gems

Property

Business assets

General inventory

## MANY LOCATIONS

without locking the main platform to a particular geography.

## MULTIPLE LOCAL OPERATORS

Sri Lanka

Australia

India

Mauritius later if required

future operators

## ONE CONSISTENT SINGHA EXPERIENCE

with the correct legal, payment, logistics and operator routing happening underneath.

The platform should be international by architecture, **not by repeatedly using the word “Global.”**

It should support auctions, **without being architecturally or commercially boxed into being only an auction website.**

The long-term goal is for:

# SINGHA

to become the recognisable brand for finding, selling, sourcing and exchanging valuable physical assets and commodities across markets.

Preserve the best work already completed.

Extend the architecture intelligently.

Prioritise the Offer System.

Design for future scale.

Then create the complete Claude Code development package.