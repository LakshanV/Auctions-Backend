# 21 — INTEGRATION REFERENCE NOTES

## Important rule
Before implementing a provider, verify its **current official documentation, permissions, limits and stable SDK/API versions**.

Provider details change faster than this architecture.

## Amazon IVS
Current official starting points at pack creation:

Real-Time Web Broadcast SDK:
https://docs.aws.amazon.com/ivs/latest/RealTimeUserGuide/broadcast-web.html

Low-Latency Web Broadcast SDK:
https://docs.aws.amazon.com/ivs/latest/LowLatencyUserGuide/broadcast-web.html

Low-Latency streaming / OBS / RTMPS / SRT:
https://docs.aws.amazon.com/ivs/latest/LowLatencyUserGuide/getting-started-set-up-streaming.html

Use provider interfaces so another live platform can replace IVS.

## YouTube Live
Official API reference:
https://developers.google.com/youtube/v3/live/docs

Use adapter for live broadcasts, streams, binding/scheduling and approved live-chat ingestion.

YouTube is never the authoritative auction clock.

## Meta
At implementation time verify current official Meta documentation for:
- WhatsApp Cloud API;
- Messenger Platform;
- Instagram Messaging;
- Facebook Pages publishing;
- webhook signatures;
- app review/permissions;
- template and messaging-window rules.

Do not encode provider policy into customer core tables.

## Payments
Create payment abstraction first.
Merchant/provider selection is a commercial decision.

## AI
Create provider/model registry.
No domain code tied to one AI vendor.

## Storage
S3-compatible abstraction.
Maintain media provenance so storage can migrate.

## Search
Search index is rebuildable and never authoritative.

## SDK versions
Pin exact dependencies in lockfile only after checking current stable provider guidance.
