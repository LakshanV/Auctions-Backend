# 06 — INVENTORY, LISTINGS, MEDIA & AI LISTING CREATION

## Asset
Permanent item record:
- asset ID;
- category;
- vendor/owner relationship;
- location;
- lifecycle;
- schema version;
- normalized/searchable attributes;
- category-specific attributes;
- provenance.

## Listing
- asset ID;
- public title/description;
- sale method;
- public reference;
- publication state;
- fees/terms;
- inspection;
- logistics;
- media/documents;
- SEO/share;
- social-promotion config.

## Listing lifecycle
Draft -> Submitted -> Review -> Changes Required/Approved -> Scheduled -> Live -> Ended -> Sold/Unsold/Withdrawn -> transaction states.

## Category schemas
At minimum:
- vehicles;
- machinery;
- gems;
- property;
- bulk stock;
- general assets.

## Media
Support:
- images;
- direct video upload;
- external video link;
- 360;
- future 3D;
- documents;
- video thumbnails;
- social derivatives.

State: Uploading -> Processing -> Ready/Failed -> Archived.

## Video pipeline
```text
client -> secure upload grant -> object storage
-> media record -> worker/transcode
-> poster + playback derivative
-> READY
```

Do not route large files unnecessarily through app server.

## AI listing creator
Inputs may include:
photos, video, registration/ownership docs, inspection reports, certificates and staff notes.

AI may draft:
- title;
- structured fields;
- description;
- keywords;
- category;
- evidence-based condition summary;
- missing-information checklist.

AI must not invent facts.

## AI image enhancement
Allowed:
exposure, white balance, crop, straighten, denoise, safe neutral background treatment, upscaling/format optimization.

Forbidden:
removing damage, changing gem colour materially, adding equipment, fabricating condition.

Original stays immutable.

## Listing wizard
1. Sale method
2. Category
3. Seller
4. Asset details
5. Category fields
6. Media
7. Documents
8. Sale settings
9. Inspection/logistics
10. Fees/terms
11. Social promotion
12. Preview
13. Submit/approve/publish
