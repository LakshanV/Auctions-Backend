# 20 — BUSINESS DEFAULTS & CONFIGURATION

## Purpose
Unknown business values must not block implementation.

Mark unresolved values `BUSINESS_APPROVAL_REQUIRED`.

## Safe product defaults

### Homepage
- Full catalogue: OFF
- Featured items: ON
- Featured event: ON
- Market Pulse: ON only when approved data/source exists

### Catalogue
- Cube: ON
- Grid: ON
- List: ON

### Sale modes
- Timed Auction: ON
- EOI: ON
- Buy Now: feature flagged initially
- Make Offer: feature flagged initially
- Sealed Tender: feature flagged initially
- Live/Hybrid: feature flagged until acceptance passes

### AI
- AI listing drafts: ON for staff
- Automatic public factual publishing without review: OFF initially
- AI image enhancement: derivative only
- Original media retention: mandatory
- AI bid/payment/release mutation: prohibited

### Social
- Default: DRAFT/REVIEW
- Production auto-publish: OFF until enabled
- Individual/group selection: ON
- Scheduled publishing: ON

### Messaging
- AI support for low-risk tasks: ON
- Human handoff: always
- Free-text accepted bid: prohibited
- Explicit bid-intent confirmation: mandatory
- High-speed final bidding: direct Singha interface/proxy preferred

### Live
- SE.lk is primary bidding experience
- YouTube is simulcast/distribution
- YouTube chat bids: prohibited
- Floor/phone bid entry: authenticated clerk only

## Initial soft-close config
Configurable starting values:
- general: trigger 10s / reset 20s;
- vehicle: trigger 15s / reset 20s;
- gem: trigger 15s / reset 25s;
- property: trigger 90s / reset 120s.

Product owner may change later without code changes.

## Business configuration requiring owner approval
- buyer premium;
- seller commission;
- VAT/tax behavior;
- deposit;
- credit/bidding limits;
- payment deadline;
- collection deadline;
- storage charges;
- refund rules;
- reserve visibility;
- public bid history;
- KYC thresholds;
- seller settlement terms.

## Languages
Architect from day one for:
- English
- Sinhala
- Tamil

Externalize strings even if translations arrive later.
