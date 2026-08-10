# 22 — CORE ENTITY BLUEPRINT

Conceptual only. Exact table naming may follow framework conventions.

## Identity
- User
- Customer
- Organization
- OrganizationMember
- ExternalIdentity
- Role
- Permission
- KycCase

## Inventory
- Asset
- AssetCategory
- CategorySchema
- AssetAttribute
- MediaObject
- MediaDerivative
- Document
- Location

## Marketplace
- Listing
- ListingRevision
- ListingStatusTransition
- FeaturedPlacement
- InspectionSlot

## Sale
- SaleEvent
- Auction
- AuctionLot
- Bid
- ProxyBidInstruction
- EoiConfig
- EoiSubmission
- EoiRevision
- Offer
- TenderSubmission
- LiveAuctionSession

## Commerce
- Sale
- Invoice
- InvoiceLine
- FinancialLedgerEntry
- Payment
- PaymentProof
- Refund
- Credit/DepositProjection

## Fulfilment
- Release
- PickupBooking
- Delivery
- FulfilmentEvent

## Settlement
- SellerSettlement
- SettlementLine
- SettlementPayment

## Communication
- Conversation
- Message
- ChannelIdentity
- Notification
- NotificationPreference
- DeliveryAttempt

## Social
- SocialCampaign
- SocialPublication
- CreativeAsset
- PublicationAttempt

## Intelligence
- AiRun
- AiInsight
- BuyerTwinSnapshot
- Recommendation
- ComparableSet
- MarketMetric
- NewsSourceItem
- MarketPulseItem

## Platform/Audit
- AuditEvent
- OutboxEvent
- IdempotencyRecord
- FeatureFlag
- BusinessConfig
- IntegrationConnection
- IntegrationEvent
