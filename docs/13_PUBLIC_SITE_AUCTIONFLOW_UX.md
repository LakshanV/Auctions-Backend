# 13 — PUBLIC SITE, HOMEPAGE & AUCTIONFLOW UX

## Style
Modern, premium, simple, artistic, trustworthy.
Not old catalogue, crowded classifieds or casino visual language.

## Homepage
No full catalogue.

Sections:
1. Header
2. Hero
3. Featured Items (4–8)
4. Featured Auction/Event
5. Explore Categories
6. Market Pulse
7. Trust/Why Singha
8. Sell With Singha / institutional CTA
9. Footer

Staff editorial controls:
- feature/unfeature;
- priority;
- date window;
- featured event/hero.

## Catalogue modes
- Cube
- Grid
- List

Persist selection and preserve search/filter state.

## AuctionFlow Cube
Rubik-inspired, not literal giant cube.

Each category/status row is an independent horizontal 3D band.

Desktop: ~3–4 cards per face.
Tablet: ~2.
Mobile: 1 prominent item.

Use DOM/CSS 3D transforms + existing motion library. No required WebGL.

Horizontal gesture rotates only the row; vertical page scroll remains natural.

## Cards
Show according to sale mode:
- image;
- reference;
- title/location;
- sale-method badge;
- current bid / guide / fixed price;
- time/closing;
- watch;
- correct CTA.

## Buyer dashboard
Top action strip:
active bids, winning, outbid, payment due, bidding limit, deposit, pickup ready.

Cube rows:
- Watching
- Bidding
- Winning
- Outbid
- Won
- Lost
- Payment Due
- Paid
- Ready for Pickup
- Delivery Pending
- EOIs Submitted
- EOI Review/Negotiation
- Past Purchases

Urgency cannot depend only on cube position.

## Accessibility
- reduced motion;
- keyboard;
- semantic headings;
- accessible next/previous;
- offscreen faces not focusable;
- Grid/List fallback;
- normal lot URLs.

## Performance
- lazy media;
- no autoplay catalogue video;
- adjacent face prefetch only;
- centralized visible timer ticker;
- stable realtime subscriptions;
- live updates do not remount/reset cube.

## Lot detail
Common media/specs/docs/inspection/logistics/terms/watch/share.
Commercial panel changes for Auction, EOI, Buy Now, Offer, Tender and Live.
