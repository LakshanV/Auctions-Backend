# 09 — SINGHA CONNECT: OMNICHANNEL COMMUNICATION

## Goal
One customer identity and conversation history across channels.

## Channels
Adapters for:
- web/app chat;
- WhatsApp;
- Facebook Messenger;
- Instagram messaging;
- email;
- SMS;
- web push;
- future voice;
- YouTube Live Chat ingestion.

## Conversation model
Conversation:
- ID;
- customer ID when resolved;
- channel;
- external thread/user ID;
- status;
- assigned agent;
- AI mode.

Message:
- direction;
- provider message ID;
- sender;
- text/attachments;
- structured payload;
- delivery/read state;
- timestamp;
- AI/human provenance.

## Identity resolution
Link external identity only after appropriate verification.
Never merge customer accounts on weak AI inference.

## AI + human handoff
AI can:
- answer approved lot questions;
- search inventory;
- explain process;
- prepare watch/inspection actions;
- draft EOI;
- query authenticated account status;
- prepare bid intent;
- route support.

Human handoff:
- dispute;
- legal/ownership issue;
- payment anomaly;
- suspicious behavior;
- low confidence;
- customer request.

## Provider policy
Respect current provider messaging windows/templates/permissions in adapter configuration, not customer core tables.

## Bid through communication channel
Required:
1. authenticated linked identity;
2. parse intent;
3. display lot, amount and key fee/term context;
4. explicit confirm;
5. signed/idempotent bid intent;
6. auction-engine validation;
7. receipt.

## Outbound events
- auction starting;
- outbid;
- winning;
- extension;
- won/lost;
- EOI status;
- invoice;
- payment;
- pickup/delivery;
- security;
- optional recommendations.

## Preferences
Per customer:
- preferred channel;
- language;
- marketing consent;
- transactional channel;
- quiet hours where permitted;
- recommendation frequency.

## Agent inbox
Show:
- conversation;
- customer 360;
- live bids/purchases;
- AI suggested response;
- send/edit;
- take over/release to AI;
- internal notes;
- escalation.
