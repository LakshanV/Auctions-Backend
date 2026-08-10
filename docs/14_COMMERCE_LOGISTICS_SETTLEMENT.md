# 14 — COMMERCE, PAYMENTS, RELEASE & SETTLEMENT

## Principle
A won/accepted listing is not a completed transaction.

The platform must continue through invoice, payment, release, collection/delivery and seller settlement.

## Invoice
After confirmed sale, generate:
- invoice number;
- buyer;
- lot(s);
- hammer/sale amount;
- buyer premium;
- tax;
- other fees;
- deposit/credit applied;
- amount due;
- payment deadline;
- instructions.

## Financial ledger
Use append-only financial events.

Do not model only a mutable `balance`.

Example event types:
- DEPOSIT_RECEIVED
- SALE_CHARGE
- BUYER_PREMIUM
- TAX
- PAYMENT_RECEIVED
- REFUND
- CREDIT_APPLIED
- SETTLEMENT_DISBURSED

## Manual bank transfer
Initial safe workflow may be:
1. show payment instructions;
2. buyer uploads proof;
3. payment = `PENDING_VERIFICATION`;
4. staff/accounts verifies;
5. ledger event records confirmation;
6. receipt generated.

Uploading proof is never equivalent to being paid.

## Payment gateway
Create provider abstraction first.

When a gateway is added:
- verify webhook signature;
- store external event/reference;
- process idempotently;
- reconcile amount/currency/order;
- never trust browser redirect as proof.

## Fulfilment
Suggested states:
- PAYMENT_PENDING
- PAYMENT_CONFIRMED
- RELEASE_APPROVED
- READY_FOR_PICKUP
- PICKUP_BOOKED
- IN_DELIVERY
- COLLECTED
- DELIVERED
- COMPLETED

## Release
Release requires authoritative server state.

Use release reference/QR where implemented.

Do not release merely from customer screenshot.

## Collection
Configurable:
- pickup location;
- collection window;
- storage deadline;
- storage fee;
- transport notes;
- authorized transporter.

## Seller settlement
Calculate:
- sale proceeds;
- commission;
- taxes;
- agreed expenses;
- transport/other deductions;
- net settlement;
- payment reference/date.

Manual adjustment requires:
- permission;
- reason;
- audit.

## Refund
Refund adds financial event; original payment remains.

## Institutional Evidence Pack
Generate a permission-aware downloadable record containing:
- published listing;
- auction configuration;
- bidder participation summary;
- bid timeline;
- soft-close extensions;
- final result;
- invoice/payment;
- release;
- settlement;
- audit references.

This becomes a major transparency product for banks, corporates and government.
