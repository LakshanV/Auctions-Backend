# 05 — IDENTITY, CUSTOMERS & SINGHA BUYER TWIN

## One customer
A single customer can link:
- website login;
- buyer/seller profiles;
- organization membership;
- WhatsApp identity;
- Facebook/Instagram identities;
- email/phone;
- future mobile identity.

External IDs never replace `customer_id`.

## Verified facts vs intelligence
Keep legal/contact/KYC/account facts separate from AI-derived interests.

## Activity events
Capture:
view, search, watch, question, inspection, EOI, offer, bid, outbid, win/loss, purchase, payment, collection and communication interaction.

## Buyer Twin
A rebuildable projection:
- category affinity;
- brand/model affinity;
- price range;
- geography;
- bidding frequency;
- purchase frequency;
- payment reliability;
- preferred channel/language;
- current buying intent.

Do not infer sensitive unrelated traits.

## Recommendations
Input:
- authoritative inventory;
- saved searches;
- explicit preferences;
- activity;
- Buyer Twin.

Output:
- lot IDs;
- score;
- reason;
- model/version/time.

Recommendations must never affect auction fairness.

## Notification relevance
AI may rank optional marketing/recommendation alerts.
Transactional alerts remain deterministic:
outbid, won, invoice, payment, release, security.

## Staff Customer 360
Role-controlled view:
- identities/contact;
- KYC/account;
- current bids/purchases;
- payments/releases;
- conversations;
- Buyer Twin;
- support flags.
