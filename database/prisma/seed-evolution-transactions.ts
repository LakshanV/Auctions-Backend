import { newId } from '@singha/contracts';
import { disconnectPrisma, getPrisma } from '../src/client';

/**
 * Singha Evolution PREVIEW — transactional demo data (NON-BINDING).
 *
 * Depends on `seed-evolution.ts` (Sri Lanka market 'LK', operator 'SINGHA-LK',
 * node 'lk-colombo', logistics nodes, seller evo-seller@demo.singha.lk owning the
 * 12 EVO-* listings) and `seed-demo.ts` (demo-seller@singha.lk owning LOT-DEMO-1..6).
 *
 * The logged-in preview member is evo-seller@demo.singha.lk. This script gives that
 * member visible activity across the Evolution surfaces: commercial + sealed offers,
 * procurement requests, supply programmes, a Singha ID profile + capabilities, a
 * watchlist, a couple of bids, and an indicative logistics quote/booking/shipment.
 *
 * Idempotent: every block is guarded (upsert on a @unique key, or find-first on a
 * stable natural key). Safe to re-run. Undone by `seed-evolution-reset.ts`.
 *
 * NON-BINDING SAFEGUARDS (critical): this script creates NO Sale, Settlement,
 * PaymentIntent, Invoice or LedgerEntry rows. An Offer may reach status 'accepted'
 * as a STATUS ONLY — the downstream Sale is never created. Data is marked demo
 * (emails @demo.singha.lk; notes / references / provider / assumptions = 'DEMO').
 * No provider / notification / webhook path is ever called — pure DB inserts.
 */

const LKR = (rupees: number): bigint => BigInt(rupees) * 100n; // integer minor units
const DAY = 86_400_000;

type Counts = {
  customers: number;
  offers: number;
  offerRevisions: number;
  offerEvents: number;
  sealedOffers: number;
  procurementRequests: number;
  procurementProposals: number;
  supplyProgrammes: number;
  perishable: number;
  profile: number;
  capabilities: number;
  watches: number;
  bids: number;
  logistics: number;
};

async function main(): Promise<void> {
  const prisma = getPrisma();
  const now = Date.now();
  const at = (days: number): Date => new Date(now + days * DAY);

  // --- Preflight: the prior seeds must have run -------------------------------
  const seller = await prisma.customer.findUnique({
    where: { email: 'evo-seller@demo.singha.lk' },
  });
  if (!seller) {
    console.error(
      'evo-seller@demo.singha.lk not found — run `seed:evolution` before `seed:evolution:tx`.',
    );
    process.exitCode = 1;
    return;
  }
  const demoSeller = await prisma.customer.findUnique({
    where: { email: 'demo-seller@singha.lk' },
  });
  if (!demoSeller) {
    console.error('demo-seller@singha.lk not found — run `seed:demo` before `seed:evolution:tx`.');
    process.exitCode = 1;
    return;
  }

  const counts: Counts = {
    customers: 0,
    offers: 0,
    offerRevisions: 0,
    offerEvents: 0,
    sealedOffers: 0,
    procurementRequests: 0,
    procurementProposals: 0,
    supplyProgrammes: 0,
    perishable: 0,
    profile: 0,
    capabilities: 0,
    watches: 0,
    bids: 0,
    logistics: 0,
  };

  // Resolve a listing id by its public reference (skip a block cleanly if absent).
  const listingCache = new Map<string, { id: string; assetId: string } | null>();
  const getListing = async (ref: string): Promise<{ id: string; assetId: string } | null> => {
    if (!listingCache.has(ref)) {
      const l = await prisma.listing.findUnique({ where: { publicRef: ref } });
      listingCache.set(ref, l ? { id: l.id, assetId: l.assetId } : null);
    }
    return listingCache.get(ref) ?? null;
  };

  // ---------------------------------------------------------------------------
  // 1. Additional demo customers (buyers + suppliers)
  // ---------------------------------------------------------------------------
  const demoPeople = [
    { email: 'evo-buyer-1@demo.singha.lk', legalName: 'Evolution Demo Buyer One' },
    { email: 'evo-buyer-2@demo.singha.lk', legalName: 'Evolution Demo Buyer Two' },
    { email: 'evo-buyer-3@demo.singha.lk', legalName: 'Evolution Demo Buyer Three' },
    { email: 'evo-supplier-1@demo.singha.lk', legalName: 'Evolution Demo Supplier One' },
    { email: 'evo-supplier-2@demo.singha.lk', legalName: 'Evolution Demo Supplier Two' },
  ];
  const idByEmail = new Map<string, string>([
    ['evo-seller@demo.singha.lk', seller.id],
    ['demo-seller@singha.lk', demoSeller.id],
  ]);
  for (const p of demoPeople) {
    const row = await prisma.customer.upsert({
      where: { email: p.email },
      update: { status: 'active', kycStatus: 'verified', legalName: p.legalName },
      create: {
        id: newId(),
        email: p.email,
        legalName: p.legalName,
        status: 'active',
        kycStatus: 'verified',
      },
    });
    idByEmail.set(p.email, row.id);
    counts.customers += 1;
  }
  const sellerId = seller.id;
  const buyer1 = idByEmail.get('evo-buyer-1@demo.singha.lk')!;
  const buyer2 = idByEmail.get('evo-buyer-2@demo.singha.lk')!;
  const buyer3 = idByEmail.get('evo-buyer-3@demo.singha.lk')!;
  const supplier1 = idByEmail.get('evo-supplier-1@demo.singha.lk')!;
  const supplier2 = idByEmail.get('evo-supplier-2@demo.singha.lk')!;

  // Shared helper: create one Offer with its immutable revisions + append-only
  // events, in FK-safe order (offer -> revisions -> point current -> events).
  // Guarded on (listingId, customerId): re-running never duplicates.
  type RevSpec = {
    authorType: 'buyer' | 'seller' | 'operator';
    authorId: string | null;
    totalPriceMinor: bigint;
    incoterm?: string;
    quantity?: string;
    quantityUnitCode?: string;
    validUntil?: Date;
    notes?: string;
  };
  type EventSpec = {
    type: 'offer' | 'counter' | 'accept' | 'reject' | 'withdraw' | 'expire';
    actorType: 'customer' | 'staff' | 'system' | 'ai';
    actorId: string | null;
    amountMinor?: bigint;
    note?: string;
  };
  const ensureOffer = async (opts: {
    listingId: string;
    customerId: string;
    status: 'open' | 'countered' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';
    amountMinor: bigint;
    sealed: boolean;
    saleMethodCode: string;
    awardPolicy?: string;
    revisions: RevSpec[];
    events: EventSpec[];
  }): Promise<boolean> => {
    const existing = await prisma.offer.findFirst({
      where: { listingId: opts.listingId, customerId: opts.customerId },
    });
    if (existing) return false;
    const offer = await prisma.offer.create({
      data: {
        id: newId(),
        listingId: opts.listingId,
        customerId: opts.customerId,
        status: opts.status,
        amountMinor: opts.amountMinor,
        currency: 'LKR',
        sealed: opts.sealed,
        revealedAt: null,
        saleMethodCode: opts.saleMethodCode,
        awardPolicy: opts.awardPolicy ?? null,
      },
    });
    let n = 1;
    let lastRevisionId: string | null = null;
    for (const r of opts.revisions) {
      const rev = await prisma.offerRevision.create({
        data: {
          id: newId(),
          offerId: offer.id,
          revisionNumber: n,
          authorType: r.authorType,
          authorId: r.authorId,
          totalPriceMinor: r.totalPriceMinor,
          currency: 'LKR',
          quantity: r.quantity ?? null,
          quantityUnitCode: r.quantityUnitCode ?? null,
          incoterm: r.incoterm ?? null,
          validUntil: r.validUntil ?? null,
          notes: r.notes ?? 'DEMO — preview offer (non-binding)',
        },
      });
      lastRevisionId = rev.id;
      n += 1;
      counts.offerRevisions += 1;
    }
    if (lastRevisionId) {
      await prisma.offer.update({
        where: { id: offer.id },
        data: { currentRevisionId: lastRevisionId },
      });
    }
    for (const e of opts.events) {
      await prisma.offerEvent.create({
        data: {
          id: newId(),
          offerId: offer.id,
          type: e.type,
          amountMinor: e.amountMinor ?? null,
          note: e.note ?? 'DEMO',
          actorType: e.actorType,
          actorId: e.actorId,
        },
      });
      counts.offerEvents += 1;
    }
    return true;
  };

  // ---------------------------------------------------------------------------
  // 2. Commercial Offers (Make Offer) — evo-seller acts as BUYER on LOT-DEMO lots.
  //    Covers every non-terminal-Sale OfferStatus: open (submitted), countered,
  //    accepted (STATUS ONLY — no Sale), rejected, expired.
  // ---------------------------------------------------------------------------
  // 2a. OPEN / "submitted" — single buyer proposal.
  {
    const l = await getListing('LOT-DEMO-1');
    if (l) {
      const made = await ensureOffer({
        listingId: l.id,
        customerId: sellerId,
        status: 'open',
        amountMinor: LKR(19_500_000),
        sealed: false,
        saleMethodCode: 'MAKE_OFFER',
        revisions: [
          {
            authorType: 'buyer',
            authorId: sellerId,
            totalPriceMinor: LKR(19_500_000),
            incoterm: 'DAP',
            notes: 'DEMO — opening make-offer, awaiting seller',
          },
        ],
        events: [
          { type: 'offer', actorType: 'customer', actorId: sellerId, amountMinor: LKR(19_500_000) },
        ],
      });
      if (made) counts.offers += 1;
    }
  }
  // 2b. COUNTERED — buyer -> seller -> buyer (3 revisions; the two counters make
  //     the buyer<->seller exchange). Status stays 'countered' (negotiation live).
  {
    const l = await getListing('LOT-DEMO-2');
    if (l) {
      const made = await ensureOffer({
        listingId: l.id,
        customerId: sellerId,
        status: 'countered',
        amountMinor: LKR(3_450_000),
        sealed: false,
        saleMethodCode: 'MAKE_OFFER',
        revisions: [
          {
            authorType: 'buyer',
            authorId: sellerId,
            totalPriceMinor: LKR(3_200_000),
            incoterm: 'EXW',
            notes: 'DEMO — buyer opening proposal',
          },
          {
            authorType: 'seller',
            authorId: demoSeller.id,
            totalPriceMinor: LKR(3_600_000),
            incoterm: 'EXW',
            notes: 'DEMO — seller counter',
          },
          {
            authorType: 'buyer',
            authorId: sellerId,
            totalPriceMinor: LKR(3_450_000),
            incoterm: 'EXW',
            notes: 'DEMO — buyer re-counter (current)',
          },
        ],
        events: [
          { type: 'offer', actorType: 'customer', actorId: sellerId, amountMinor: LKR(3_200_000) },
          {
            type: 'counter',
            actorType: 'customer',
            actorId: demoSeller.id,
            amountMinor: LKR(3_600_000),
            note: 'DEMO — seller counter',
          },
          {
            type: 'counter',
            actorType: 'customer',
            actorId: sellerId,
            amountMinor: LKR(3_450_000),
            note: 'DEMO — buyer re-counter',
          },
        ],
      });
      if (made) counts.offers += 1;
    }
  }
  // 2c. ACCEPTED — STATUS ONLY. No Sale/Settlement/Invoice is created (safeguard).
  {
    const l = await getListing('LOT-DEMO-3');
    if (l) {
      const made = await ensureOffer({
        listingId: l.id,
        customerId: sellerId,
        status: 'accepted',
        amountMinor: LKR(8_400_000),
        sealed: false,
        saleMethodCode: 'MAKE_OFFER',
        revisions: [
          {
            authorType: 'buyer',
            authorId: sellerId,
            totalPriceMinor: LKR(8_400_000),
            incoterm: 'DAP',
            notes: 'DEMO — accepted terms (status only, no Sale created)',
          },
        ],
        events: [
          { type: 'offer', actorType: 'customer', actorId: sellerId, amountMinor: LKR(8_400_000) },
          {
            type: 'accept',
            actorType: 'customer',
            actorId: demoSeller.id,
            note: 'DEMO — accepted status only (non-binding preview; no downstream Sale)',
          },
        ],
      });
      if (made) counts.offers += 1;
    }
  }
  // 2d. REJECTED.
  {
    const l = await getListing('LOT-DEMO-4');
    if (l) {
      const made = await ensureOffer({
        listingId: l.id,
        customerId: sellerId,
        status: 'rejected',
        amountMinor: LKR(84_000_000),
        sealed: false,
        saleMethodCode: 'MAKE_OFFER',
        revisions: [
          {
            authorType: 'buyer',
            authorId: sellerId,
            totalPriceMinor: LKR(84_000_000),
            incoterm: 'EXW',
            notes: 'DEMO — below reserve',
          },
        ],
        events: [
          { type: 'offer', actorType: 'customer', actorId: sellerId, amountMinor: LKR(84_000_000) },
          {
            type: 'reject',
            actorType: 'customer',
            actorId: demoSeller.id,
            note: 'DEMO — seller rejected',
          },
        ],
      });
      if (made) counts.offers += 1;
    }
  }
  // 2e. EXPIRED — revision validity in the past; system expiry event.
  {
    const l = await getListing('LOT-DEMO-5');
    if (l) {
      const made = await ensureOffer({
        listingId: l.id,
        customerId: sellerId,
        status: 'expired',
        amountMinor: LKR(11_500_000),
        sealed: false,
        saleMethodCode: 'MAKE_OFFER',
        revisions: [
          {
            authorType: 'buyer',
            authorId: sellerId,
            totalPriceMinor: LKR(11_500_000),
            incoterm: 'DAP',
            validUntil: at(-2),
            notes: 'DEMO — lapsed offer',
          },
        ],
        events: [
          { type: 'offer', actorType: 'customer', actorId: sellerId, amountMinor: LKR(11_500_000) },
          {
            type: 'expire',
            actorType: 'system',
            actorId: null,
            note: 'DEMO — validity window elapsed',
          },
        ],
      });
      if (made) counts.offers += 1;
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Sealed offer comparison — 3 confidential offers on EVO-GEM-1 from three
  //    buyers with different amounts. Kept sealed (revealedAt null) and NOT
  //    awarded; awardPolicy MANUAL_SELECTION (D4: highest never auto-awards).
  // ---------------------------------------------------------------------------
  {
    const l = await getListing('EVO-GEM-1');
    if (l) {
      const sealedBids: Array<{ buyer: string; amount: number }> = [
        { buyer: buyer1, amount: 6_500_000 },
        { buyer: buyer2, amount: 6_900_000 },
        { buyer: buyer3, amount: 6_350_000 },
      ];
      for (const s of sealedBids) {
        const made = await ensureOffer({
          listingId: l.id,
          customerId: s.buyer,
          status: 'open',
          amountMinor: LKR(s.amount),
          sealed: true,
          saleMethodCode: 'SEALED_TENDER',
          awardPolicy: 'MANUAL_SELECTION',
          revisions: [
            {
              authorType: 'buyer',
              authorId: s.buyer,
              totalPriceMinor: LKR(s.amount),
              incoterm: 'EXW',
              notes: 'DEMO — sealed bid (confidential, not revealed)',
            },
          ],
          events: [
            {
              type: 'offer',
              actorType: 'customer',
              actorId: s.buyer,
              amountMinor: LKR(s.amount),
              note: 'DEMO — sealed submission',
            },
          ],
        });
        if (made) counts.sealedOffers += 1;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Procurement — evo-seller as BUYER posts requests; two suppliers respond
  //    with different commercial terms so ranking is meaningful. Status 'open'
  //    (never awarded — awardedProposalId stays null).
  // ---------------------------------------------------------------------------
  type ProposalSpec = {
    supplier: string;
    totalPriceMinor: bigint;
    unitPriceMinor?: bigint;
    quantity: string;
    quantityUnitCode: string;
    incoterm: string;
    deliveryInDays: number;
    paymentTerms: string;
    notes: string;
  };
  const procurement: Array<{
    title: string;
    type: 'RFQ' | 'REQUEST_SUPPLY' | 'REVERSE_TENDER';
    category: string;
    specification: string;
    quantity: string;
    quantityUnitCode: string;
    destinationCountry: string;
    paymentTerms: string;
    proposals: ProposalSpec[];
  }> = [
    {
      title: '200 MT Red Onion to Colombo',
      type: 'RFQ',
      category: 'produce',
      specification: 'DEMO — Fresh red onion, ≤5% spoilage, phytosanitary certificate required.',
      quantity: '200',
      quantityUnitCode: 'MT',
      destinationCountry: 'LK',
      paymentTerms: '30 days net',
      proposals: [
        {
          supplier: supplier1,
          totalPriceMinor: LKR(58_000_000),
          unitPriceMinor: LKR(290_000),
          quantity: '200',
          quantityUnitCode: 'MT',
          incoterm: 'CIF',
          deliveryInDays: 14,
          paymentTerms: '30 days net',
          notes: 'DEMO — CIF Colombo, standard lead time',
        },
        {
          supplier: supplier2,
          totalPriceMinor: LKR(62_000_000),
          unitPriceMinor: LKR(310_000),
          quantity: '200',
          quantityUnitCode: 'MT',
          incoterm: 'FOB',
          deliveryInDays: 9,
          paymentTerms: 'Cash against documents',
          notes: 'DEMO — faster despatch, FOB',
        },
      ],
    },
    {
      title: '20 Excavator Buckets (20-ton class)',
      type: 'RFQ',
      category: 'machinery',
      specification: 'DEMO — GP buckets, 20t class, twin-pin, hardened cutting edge.',
      quantity: '20',
      quantityUnitCode: 'unit',
      destinationCountry: 'LK',
      paymentTerms: '50% advance, 50% on delivery',
      proposals: [
        {
          supplier: supplier1,
          totalPriceMinor: LKR(4_400_000),
          unitPriceMinor: LKR(220_000),
          quantity: '20',
          quantityUnitCode: 'unit',
          incoterm: 'DAP',
          deliveryInDays: 30,
          paymentTerms: '50/50',
          notes: 'DEMO — DAP site, 30-day lead',
        },
        {
          supplier: supplier2,
          totalPriceMinor: LKR(4_100_000),
          unitPriceMinor: LKR(205_000),
          quantity: '20',
          quantityUnitCode: 'unit',
          incoterm: 'CFR',
          deliveryInDays: 45,
          paymentTerms: 'LC at sight',
          notes: 'DEMO — cheaper unit price, longer lead',
        },
      ],
    },
    {
      title: 'Ceylon Cinnamon (Alba) 10 MT/month',
      type: 'REQUEST_SUPPLY',
      category: 'produce',
      specification: 'DEMO — Alba grade, recurring 10 MT monthly, export documentation.',
      quantity: '10',
      quantityUnitCode: 'MT',
      destinationCountry: 'AE',
      paymentTerms: 'LC at sight',
      proposals: [
        {
          supplier: supplier1,
          totalPriceMinor: LKR(15_000_000),
          unitPriceMinor: LKR(1_500_000),
          quantity: '10',
          quantityUnitCode: 'MT',
          incoterm: 'FOB',
          deliveryInDays: 20,
          paymentTerms: 'LC at sight',
          notes: 'DEMO — FOB Colombo, monthly',
        },
        {
          supplier: supplier2,
          totalPriceMinor: LKR(14_200_000),
          unitPriceMinor: LKR(1_420_000),
          quantity: '10',
          quantityUnitCode: 'MT',
          incoterm: 'CIF',
          deliveryInDays: 25,
          paymentTerms: '20% advance, balance LC',
          notes: 'DEMO — CIF Jebel Ali, lower price',
        },
      ],
    },
  ];
  for (const req of procurement) {
    let request = await prisma.procurementRequest.findFirst({
      where: { buyerCustomerId: sellerId, title: req.title },
    });
    if (!request) {
      request = await prisma.procurementRequest.create({
        data: {
          id: newId(),
          type: req.type,
          status: 'open',
          title: req.title,
          category: req.category,
          specification: req.specification,
          quantity: req.quantity,
          quantityUnitCode: req.quantityUnitCode,
          destinationCountry: req.destinationCountry,
          deliveryBy: at(30),
          currency: 'LKR',
          paymentTerms: req.paymentTerms,
          operatorCode: 'SINGHA-LK',
          buyerCustomerId: sellerId,
          submissionCloseAt: at(10),
        },
      });
      counts.procurementRequests += 1;
    }
    for (const p of req.proposals) {
      const existing = await prisma.procurementProposal.findFirst({
        where: { requestId: request.id, supplierCustomerId: p.supplier },
      });
      if (existing) continue;
      await prisma.procurementProposal.create({
        data: {
          id: newId(),
          requestId: request.id,
          supplierCustomerId: p.supplier,
          status: 'open',
          totalPriceMinor: p.totalPriceMinor,
          unitPriceMinor: p.unitPriceMinor ?? null,
          currency: 'LKR',
          quantity: p.quantity,
          quantityUnitCode: p.quantityUnitCode,
          incoterm: p.incoterm,
          deliveryDate: at(p.deliveryInDays),
          paymentTerms: p.paymentTerms,
          validUntil: at(10),
          notes: p.notes,
        },
      });
      counts.procurementProposals += 1;
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Supply Programmes — evo-seller as SUPPLIER, across produce / scrap /
  //    machinery, mixed status. The produce (Red Onion) one is perishable and
  //    carries PerishableMetadata.
  // ---------------------------------------------------------------------------
  const programmes: Array<{
    product: string;
    category: string;
    availableQuantity: string;
    quantityUnitCode: string;
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'on_demand';
    pricingBasis: 'total_lot' | 'per_unit';
    indicativePriceMinor: bigint;
    incoterm: string;
    status: 'draft' | 'active' | 'paused' | 'expired' | 'withdrawn';
    leadTimeDays: number;
    quality: string;
    packing: string;
    perishable: boolean;
  }> = [
    {
      product: 'Red Onion (Grade A)',
      category: 'produce',
      availableQuantity: '500',
      quantityUnitCode: 'MT',
      frequency: 'weekly',
      pricingBasis: 'per_unit',
      indicativePriceMinor: LKR(280_000),
      incoterm: 'FOB',
      status: 'active',
      leadTimeDays: 7,
      quality: 'DEMO — export grade, ≤5% spoilage',
      packing: '25kg mesh bags',
      perishable: true,
    },
    {
      product: 'Ceylon Cinnamon (Alba)',
      category: 'produce',
      availableQuantity: '30',
      quantityUnitCode: 'MT',
      frequency: 'monthly',
      pricingBasis: 'per_unit',
      indicativePriceMinor: LKR(1_450_000),
      incoterm: 'FOB',
      status: 'active',
      leadTimeDays: 21,
      quality: 'DEMO — Alba grade',
      packing: '25kg cartons',
      perishable: false,
    },
    {
      product: 'Heavy Melting Steel Scrap (HMS 1&2)',
      category: 'scrap',
      availableQuantity: '2000',
      quantityUnitCode: 'MT',
      frequency: 'monthly',
      pricingBasis: 'per_unit',
      indicativePriceMinor: LKR(80_000),
      incoterm: 'CFR',
      status: 'draft',
      leadTimeDays: 14,
      quality: 'DEMO — HMS 1&2 mix',
      packing: 'Loose / baled',
      perishable: false,
    },
    {
      product: 'Used Excavators (Komatsu / CAT 20-30T)',
      category: 'machinery',
      availableQuantity: '15',
      quantityUnitCode: 'unit',
      frequency: 'on_demand',
      pricingBasis: 'per_unit',
      indicativePriceMinor: LKR(9_500_000),
      incoterm: 'FOB',
      status: 'draft',
      leadTimeDays: 30,
      quality: 'DEMO — inspected, running',
      packing: 'RORO / flat rack',
      perishable: false,
    },
  ];
  for (const sp of programmes) {
    let programme = await prisma.supplyProgramme.findFirst({
      where: { supplierCustomerId: sellerId, product: sp.product },
    });
    if (!programme) {
      programme = await prisma.supplyProgramme.create({
        data: {
          id: newId(),
          supplierCustomerId: sellerId,
          product: sp.product,
          category: sp.category,
          originCountry: 'LK',
          availableQuantity: sp.availableQuantity,
          quantityUnitCode: sp.quantityUnitCode,
          frequency: sp.frequency,
          minOrderQuantity: '5',
          pricingBasis: sp.pricingBasis,
          indicativePriceMinor: sp.indicativePriceMinor,
          currency: 'LKR',
          packing: sp.packing,
          quality: sp.quality,
          incoterm: sp.incoterm,
          validFrom: at(-1),
          validUntil: at(90),
          leadTimeDays: sp.leadTimeDays,
          operatorCode: 'SINGHA-LK',
          status: sp.status,
        },
      });
      counts.supplyProgrammes += 1;
    }
    if (sp.perishable) {
      await prisma.perishableMetadata.upsert({
        where: {
          subjectType_subjectId: { subjectType: 'supply_programme', subjectId: programme.id },
        },
        update: {},
        create: {
          id: newId(),
          subjectType: 'supply_programme',
          subjectId: programme.id,
          harvestDate: at(-3),
          packingDate: at(-2),
          expiryDate: at(21),
          variety: 'Red Onion',
          grade: 'A',
          size: 'Medium',
          moisturePercent: '12.5',
          qualitySpec: 'DEMO — export grade',
          coldChain: true,
          tempMinC: '4',
          tempMaxC: '10',
          phytosanitaryCert: true,
          originCert: true,
          availableQuantity: '500',
          minQuantity: '5',
          shipmentWindowStart: at(2),
          shipmentWindowEnd: at(14),
        },
      });
      counts.perishable += 1;
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Singha ID — profile + capability grants in three states.
  //    'sell' verified, 'export' pending, 'high_value_trade' rejected.
  // ---------------------------------------------------------------------------
  await prisma.customerProfile.upsert({
    where: { customerId: sellerId },
    update: {
      countryResidency: 'LK',
      displayCurrency: 'LKR',
      language: 'en',
      timezone: 'Asia/Colombo',
    },
    create: {
      id: newId(),
      customerId: sellerId,
      countryResidency: 'LK',
      displayCurrency: 'LKR',
      language: 'en',
      timezone: 'Asia/Colombo',
      companyRoles: ['seller', 'buyer'],
      notificationPrefs: { email: true, whatsapp: true, sms: false },
    },
  });
  counts.profile += 1;

  const capabilities: Array<{
    capability: string;
    status: 'pending' | 'verified' | 'expired' | 'rejected';
    evidenceRef: string;
    verifiedAt: Date | null;
    expiresAt: Date | null;
  }> = [
    {
      capability: 'sell',
      status: 'verified',
      evidenceRef: 'DEMO-KYC-SELL',
      verifiedAt: at(-30),
      expiresAt: at(335),
    },
    {
      capability: 'export',
      status: 'pending',
      evidenceRef: 'DEMO-EXPORT-LICENCE',
      verifiedAt: null,
      expiresAt: null,
    },
    {
      capability: 'high_value_trade',
      status: 'rejected',
      evidenceRef: 'DEMO-HVT-EVIDENCE',
      verifiedAt: null,
      expiresAt: null,
    },
  ];
  for (const c of capabilities) {
    await prisma.customerCapability.upsert({
      where: { customerId_capability: { customerId: sellerId, capability: c.capability } },
      update: { status: c.status, evidenceRef: c.evidenceRef, verifiedAt: c.verifiedAt, expiresAt: c.expiresAt },
      create: {
        id: newId(),
        customerId: sellerId,
        capability: c.capability,
        status: c.status,
        evidenceRef: c.evidenceRef,
        verifiedAt: c.verifiedAt,
        expiresAt: c.expiresAt,
        // decidedByCustomerId left null: no operator-customer exists in the preview.
      },
    });
    counts.capabilities += 1;
  }

  // ---------------------------------------------------------------------------
  // 7. Watchlist — evo-seller watches a mix of EVO-* and LOT-DEMO-* listings.
  // ---------------------------------------------------------------------------
  for (const ref of ['EVO-GEM-2', 'EVO-MAC-2', 'LOT-DEMO-1', 'LOT-DEMO-6']) {
    const l = await getListing(ref);
    if (!l) continue;
    await prisma.watch.upsert({
      where: { customerId_listingId: { customerId: sellerId, listingId: l.id } },
      update: {},
      create: { id: newId(), customerId: sellerId, listingId: l.id },
    });
    counts.watches += 1;
  }

  // ---------------------------------------------------------------------------
  // 8. Bids — intentionally NOT seeded. The Bid ledger is append-only (a DB
  //    trigger rejects DELETE — non-negotiable rule #5), so a demo bid can never
  //    be cleaned up and its append-only row would pin the demo customer forever
  //    (FK), breaking the reset guarantee. Per the "where safely representable"
  //    caveat, bids are omitted so ALL preview data stays fully resettable.
  //    (Bidding activity is still demonstrable via the offers/auctions surfaces.)
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // 9. Logistics — indicative quote (LKCMB -> AEJEA), a booking off it, and a
  //    shipment with a short append-only event timeline. Provider 'SINGHA-DEMO'
  //    marks the whole chain demo/non-binding.
  // ---------------------------------------------------------------------------
  {
    let quote = await prisma.logisticsQuote.findFirst({
      where: { provider: 'SINGHA-DEMO', originNodeCode: 'LKCMB', destinationNodeCode: 'AEJEA' },
    });
    if (!quote) {
      quote = await prisma.logisticsQuote.create({
        data: {
          id: newId(),
          originNodeCode: 'LKCMB',
          destinationNodeCode: 'AEJEA',
          transportMode: 'SEA_FCL',
          incoterm: 'CIF',
          freightArranger: 'singha',
          chargeableUnits: 24000,
          amountMinor: LKR(1_250_000),
          currency: 'LKR',
          provider: 'SINGHA-DEMO',
          assumptions: {
            demo: true,
            source: 'preview',
            basis: 'indicative',
            note: 'DEMO — non-binding preview estimate',
          },
          status: 'QUOTED',
          quotedAt: at(0),
          expiresAt: at(7),
        },
      });
    }
    let booking = await prisma.logisticsBooking.findUnique({ where: { quoteId: quote.id } });
    if (!booking) {
      booking = await prisma.logisticsBooking.create({
        data: {
          id: newId(),
          quoteId: quote.id,
          originNodeCode: quote.originNodeCode,
          destinationNodeCode: quote.destinationNodeCode,
          transportMode: quote.transportMode,
          incoterm: quote.incoterm,
          freightArranger: quote.freightArranger,
          amountMinor: quote.amountMinor,
          currency: quote.currency,
          provider: 'SINGHA-DEMO',
          bookedByCustomerId: sellerId,
        },
      });
    }
    let shipment = await prisma.logisticsShipment.findUnique({ where: { bookingId: booking.id } });
    if (!shipment) {
      shipment = await prisma.logisticsShipment.create({
        data: { id: newId(), bookingId: booking.id, status: 'IN_TRANSIT' },
      });
    }
    const timeline: Array<{
      type: string;
      status: string;
      note: string;
      locationCode: string;
      atDays: number;
    }> = [
      { type: 'BOOKED', status: 'BOOKED', note: 'DEMO — booking confirmed', locationCode: 'LKCMB', atDays: -5 },
      { type: 'PICKED_UP', status: 'PICKED_UP', note: 'DEMO — cargo received at CFS', locationCode: 'LKCMB', atDays: -4 },
      {
        type: 'IN_TRANSIT',
        status: 'IN_TRANSIT',
        note: 'DEMO — vessel departed Colombo for Jebel Ali',
        locationCode: 'LKCMB',
        atDays: -3,
      },
    ];
    for (const ev of timeline) {
      const existing = await prisma.logisticsShipmentEvent.findFirst({
        where: { shipmentId: shipment.id, type: ev.type },
      });
      if (existing) continue;
      await prisma.logisticsShipmentEvent.create({
        data: {
          id: newId(),
          shipmentId: shipment.id,
          type: ev.type,
          status: ev.status,
          note: ev.note,
          locationCode: ev.locationCode,
          occurredAt: at(ev.atDays),
        },
      });
    }
    counts.logistics += 1;
  }

  console.log(
    'Seeded Evolution preview transactions (NON-BINDING; no Sale/Settlement/Payment/Invoice/Ledger):\n' +
      `  customers ensured:        ${counts.customers} (evo-buyer-1/-2/-3, evo-supplier-1/-2)\n` +
      `  commercial offers:        ${counts.offers} (open, countered, accepted[status-only], rejected, expired)\n` +
      `    offer revisions:        ${counts.offerRevisions}\n` +
      `    offer events:           ${counts.offerEvents}\n` +
      `  sealed offers (EVO-GEM-1):${counts.sealedOffers}\n` +
      `  procurement requests:     ${counts.procurementRequests}\n` +
      `    proposals:              ${counts.procurementProposals}\n` +
      `  supply programmes:        ${counts.supplyProgrammes}\n` +
      `    perishable metadata:    ${counts.perishable}\n` +
      `  singha profile:           ${counts.profile}\n` +
      `    capabilities:           ${counts.capabilities} (sell=verified, export=pending, high_value_trade=rejected)\n` +
      `  watchlist:                ${counts.watches}\n` +
      `  bids:                     omitted by design (append-only ledger — keeps preview fully resettable)\n` +
      `  logistics chains:         ${counts.logistics} (quote+booking+shipment+events)`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
