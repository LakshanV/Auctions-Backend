# 15 — SECURITY, PRIVACY & AUDIT

## Security areas
Review and test:
- authentication;
- server-side authorization;
- RBAC/ABAC;
- IDOR;
- password reset;
- staff MFA;
- rate limits;
- bid API abuse;
- CSRF where relevant;
- XSS/sanitization;
- file upload validation;
- signed/private document access;
- secret management;
- webhook authenticity;
- SSRF;
- log redaction;
- dependency vulnerabilities.

## Roles
Possible roles:
- customer;
- seller;
- seller staff;
- auction staff;
- floor clerk;
- phone clerk;
- producer;
- accounts;
- support;
- compliance;
- admin;
- super-admin.

Use least privilege.

## Never expose publicly
- proxy maximum;
- private EOI/tender values;
- KYC files;
- confidential seller contact;
- hidden reserve;
- staff notes;
- private valuation;
- settlement internals;
- customer intelligence/profile data.

## High-risk admin actions
Require permission + confirmation + reason + audit:
- cancel/reopen live auction;
- reserve change;
- bidder suspension;
- bid reversal/correction;
- winner override where policy permits;
- payment confirmation;
- release approval;
- settlement adjustment.

Prefer no override at all where rules do not require it.

## Audit vs operational logs
Audit log is business evidence.
Operational logs are system diagnostics.
Do not confuse them.

Normal admins cannot delete audit events.

## AI privacy
- send minimum context necessary;
- block secrets/financial credentials;
- record model/prompt provenance;
- never use unapproved sensitive fields for recommendations.

## Messaging privacy
- provider tokens/secrets encrypted;
- webhook signatures verified;
- external identities linked carefully;
- marketing consent recorded.

## Security tests before production
- SAST/dependency scan;
- permission matrix;
- concurrency abuse;
- upload malware/MIME limits;
- webhook replay/idempotency;
- authentication/session tests;
- restore/recovery test.
