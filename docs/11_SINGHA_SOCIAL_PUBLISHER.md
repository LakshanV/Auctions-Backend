# 11 — SINGHA SOCIAL PUBLISHER

## Goal
Turn approved listings into optional social promotion without re-entering asset information.

## Listing-wizard choice
Promotion mode:
- NONE
- INDIVIDUAL_ITEM
- GROUPED_CAMPAIGN
- INDIVIDUAL_AND_GROUP
- FEATURED_PREMIUM

Channels:
- Facebook Page
- Instagram
- future adapters

Publishing:
- with listing;
- scheduled;
- draft;
- manual approval.

## Grouped campaign
Collect listings into campaigns such as:
- fleet auction;
- machinery clearance;
- gem event;
- property EOI;
- institutional disposal.

AI drafts:
- campaign title;
- caption;
- multi-asset creative;
- destination URL;
- reminder copy.

## Creative system
Use approved listing data:
- approved title;
- approved image/video derivatives;
- sale mode;
- lot ref;
- closing date;
- public price/current bid where allowed.

Create controlled Singha templates rather than random styles.

Suggested template families:
- Minimal White
- Premium Black
- Industrial
- Editorial Property
- Multi Asset
- Singha Live

## Publication data
- publication ID;
- listing/campaign ID;
- channel;
- type;
- creative asset ID;
- caption version;
- status;
- schedule;
- provider post ID;
- publish time;
- retries/failure;
- attribution tags.

Status:
Draft -> Approved -> Scheduled -> Publishing -> Published/Failed/Cancelled.

## Event-driven drafts
Optional:
- listing live;
- three days before closing;
- final day;
- live event start;
- featured event.

Default initially: human approval.

## Analytics
Measure useful attribution where possible:
- clicks;
- registrations;
- watches;
- EOI;
- bids;
- buyer source.

## Data safety
Social publications are derivatives. Changing them never changes core listing/inventory data.

"Grouped campaign" means multiple Singha items grouped into one campaign/post. Do not make core architecture depend on automatic posting to third-party Facebook Groups.
