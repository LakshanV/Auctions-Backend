# 03 — SYSTEM ARCHITECTURE & MONOREPO

## Style
Use a modular monolith with strict domain boundaries and transactional outbox. Avoid premature microservices.

## Suggested monorepo
```text
/
├── CLAUDE.md
├── apps/
│   ├── web/
│   ├── api/
│   ├── worker/
│   └── live-console/
├── packages/
│   ├── contracts/
│   ├── domain/
│   ├── ui/
│   ├── auctionflow/
│   ├── config/
│   ├── observability/
│   └── test-utils/
├── database/
├── infrastructure/
└── docs/
```

## Domain modules
- Identity/Customer
- Seller/Vendor
- Inventory/Asset
- Media/Documents
- Marketplace/Listing
- Auction
- EOI/Offer/Tender
- Commerce
- Payments
- Fulfilment
- Settlement
- Notifications
- Conversations
- Social Publisher
- Live Auction
- AI/Intelligence
- Analytics
- Audit
- Search

## Domain interaction
Prefer commands and events.

Example:
```text
AUCTION_CLOSED
 -> SALE_CONFIRMED
 -> invoice
 -> notification
 -> settlement projection
 -> analytics
```

Business transaction and outbox event commit atomically.

## API
- versioned contracts;
- typed DTOs;
- idempotency for bids/payments/purchases/publication;
- pagination;
- no raw DB model exposure.

## Read models
Dashboard/Cube/Market Pulse projections are disposable and rebuildable.

## Provider adapters
- VideoProvider
- MessagingProvider
- SocialPublisher
- EmailProvider
- SmsProvider
- PaymentProvider
- AiTextProvider
- AiVisionProvider
- ImageEnhancementProvider
- StorageProvider
- SearchProvider

## Realtime
Server owns auction state. Clients receive updates and re-sync on reconnect.
