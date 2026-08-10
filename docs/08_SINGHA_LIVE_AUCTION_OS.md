# 08 — SINGHA LIVE AUCTION OS

## Goal
Own the auction software and bidder experience while using replaceable professional streaming infrastructure underneath.

The video provider never determines auction state.

## Architecture
```text
Cameras / Phones / OBS / Hardware Encoder
              |
              v
        Live Ingest Adapter
              |
      +-------+--------+
      |                |
      v                v
SE.lk Primary     Simulcast Gateway
Low-Latency            |
Live Room         +----+------+
                  |           |
               YouTube      future
```

Recommended first provider evaluation: Amazon IVS, behind interfaces.

## Ingest
Support:
1. Browser camera/microphone broadcaster.
2. Remote phone camera workflow.
3. OBS/professional RTMPS/SRT-capable encoder path.
4. Multi-camera real-time stage.

## Auctioneer console
Large controls:
- current lot;
- current/opening bid;
- reserve indicator;
- online leader;
- floor/phone activity;
- OPEN;
- FLOOR BID;
- PHONE BID;
- GOING ONCE;
- GOING TWICE;
- SOLD;
- PASS;
- PAUSE;
- NEXT.

Actions call deterministic domain commands and create audit events.

## Clerk console
Roles:
- floor bid clerk;
- phone clerk;
- event manager;
- video producer.

Clerk enters bidder identity/number + amount + source.

## Producer console
- source previews;
- program feed;
- switch sources;
- overlays;
- audio meters;
- stream health;
- simulcast health;
- recording status;
- emergency slate.

## Bidder live room
Desktop:
video + current lot + current/next bid + bidder state + bid controls + queue + docs/questions.

Mobile:
video + sticky status + thumb-safe bid + lot drawer without gesture conflicts.

## YouTube simulcast
YouTube is a marketing/distribution feed.

Adapter should support when credentials permit:
- create/manage live broadcast;
- bind stream;
- schedule;
- start/stop state;
- store external IDs;
- health monitoring.

Never use YouTube viewer latency/timestamps as authoritative auction time.

## YouTube live chat
May feed support/producer inbox.
No unauthenticated binding bids from public chat.

## Dynamic overlays
Examples:
- LIVE;
- lot number/title;
- current bid;
- reserve met if public;
- ONLINE/FLOOR;
- GOING ONCE/TWICE;
- SOLD.

Overlay state comes from auction engine.

## Recording/replay
Store full recording/session metadata and lot open/close timestamps.
Enable full replay and lot-specific replay/clipping later.

## Failover
Operator console shows:
- auction engine health;
- realtime health;
- primary stream;
- backup ingest;
- simulcast.

If critical video path fails, auctioneer can pause; pause/resume is auditable.

## Acceptance
Prove:
- two online bidders + floor clerk;
- synchronized lot changes;
- YouTube simulcast can fail while Singha continues;
- recording metadata;
- all bid sources in one ledger.
