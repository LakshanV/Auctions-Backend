# 10 — SINGHA AI CORE

## Principle
AI is a replaceable derived intelligence layer, not a source of truth.

## Provider abstraction
Model registry/adapters for:
- text/reasoning;
- vision/document extraction;
- embeddings;
- image enhancement/generation where approved;
- speech-to-text;
- translation;
- optional local/open-source models.

Business domains do not import vendor SDKs directly.

## AI task families
### Listing AI
- document extraction;
- field extraction;
- title/description draft;
- category/keywords;
- missing-info checklist;
- social captions.

### Media AI
- quality assessment;
- safe enhancement;
- thumbnail selection;
- video chapter/clip suggestions.

### Customer AI
- multilingual assistant;
- search/discovery;
- conversation summaries;
- Buyer Twin;
- recommendations.

### Staff Copilot
Read-oriented examples:
- unpaid buyers over X;
- EOI closing soon;
- low-interest lots;
- seller settlements due;
- report drafts.

Consequential action always previews and requires authorized confirmation.

### Live AI
- captions;
- transcript;
- approved-data Q&A;
- later translation;
- post-event summaries.

### Market AI
- source ingestion;
- classify/dedupe;
- summaries;
- internal market commentary.

## Governance record
Store:
- task type;
- prompt version;
- model/provider/version;
- input references;
- output;
- confidence;
- review state;
- cost/latency where useful.

## Tool access
Give AI narrow tools:
- searchLots
- getPublicLotFacts
- getAuthenticatedCustomerStatus
- createWatchIntent
- createBidIntent
- draftEoi
- getInvoiceStatus

No arbitrary SQL/database mutation.

## Review defaults
Human approval initially required for:
- public listing factual copy;
- enhanced media publication;
- social publication;
- external market/news publication.

## Hard prohibitions
AI cannot independently:
- accept/alter bids;
- choose winner outside engine;
- mark payment;
- approve release;
- alter financial ledger;
- approve KYC;
- delete audit history;
- change live reserve without authorized deterministic command.

## Cost/speed
Route tasks to suitable model classes, cache stable summaries, batch embeddings, make non-interactive jobs asynchronous, and track cost per task.
