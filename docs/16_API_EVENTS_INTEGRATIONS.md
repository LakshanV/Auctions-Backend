# 16 — API, EVENTS & INTEGRATION CONTRACTS

## API versioning
Use explicit versioning such as `/api/v1`.

Never expose database records directly as stable public contracts.

## Command endpoints
Prefer business commands:
- submitListing
- approveListing
- publishListing
- placeBid
- cancelAuction
- submitEoi
- acceptEoi
- confirmPayment
- approveRelease

Avoid arbitrary generic PATCH that can set commercial states without domain validation.

## Idempotency required
- bids;
- Buy Now purchase;
- payment/webhooks;
- refund/disbursement;
- social publishing;
- provider message retry where duplicates matter.

## Domain events
Examples:
- CUSTOMER_VERIFIED
- LISTING_APPROVED
- LISTING_PUBLISHED
- AUCTION_OPENED
- BID_ACCEPTED
- BIDDER_OUTBID
- SOFT_CLOSE_EXTENDED
- AUCTION_CLOSED
- SALE_CONFIRMED
- EOI_SUBMITTED
- EOI_ACCEPTED
- INVOICE_ISSUED
- PAYMENT_CONFIRMED
- RELEASE_APPROVED
- ITEM_COLLECTED
- SELLER_SETTLED
- SOCIAL_PUBLICATION_REQUESTED
- SOCIAL_PUBLICATION_PUBLISHED
- LIVE_BROADCAST_STARTED
- LIVE_BROADCAST_ENDED

## Transactional outbox
Business transaction and outbox record commit atomically.

Dispatcher/worker retries events.

Consumers are idempotent.

## Contracts package
Keep versioned DTO/event schemas shared across apps.

Add compatibility tests.

## Provider interfaces
At minimum:
- VideoProvider
- LiveStageProvider
- SimulcastProvider
- MessagingProvider
- SocialPublisher
- EmailProvider
- SmsProvider
- PaymentProvider
- AiTextProvider
- AiVisionProvider
- ImageEnhancementProvider
- SpeechProvider
- StorageProvider
- SearchProvider

## Webhooks
For each external webhook:
1. verify authenticity;
2. retain provider event ID;
3. idempotently process;
4. correlate/log;
5. support safe replay.

## Integration health
Admin screen should show:
- configured/not configured;
- last successful webhook;
- queue failures;
- token/credential expiry warnings;
- latest provider error;
- feature flag state.

External provider failure should not corrupt authoritative domain data.
