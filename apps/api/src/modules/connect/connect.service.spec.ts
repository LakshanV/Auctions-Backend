import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { Role } from '@singha/contracts';
import { ConnectService } from './connect.service';
import { issueContinuityToken } from '../../shared/auth/continuity-token';
import { type PrismaService } from '../../prisma/prisma.service';
import { type UnitOfWork, type UowContext } from '../../shared/persistence/unit-of-work';
import { type AuctionService } from '../auction/auction.service';
import { type MessageChannelProvider } from './channel.provider';
import { type Principal } from '../../shared/auth/principal';

// Inbound continuation is invoked by a webhook/service actor, not a specific authenticated
// customer — mirrors how scripts/e2e-connect.mjs calls /connect/inbound with a staff token.
const system: Principal = { customerId: null, roles: [], permissions: new Set(), aal: 'aal1' };

interface ConversationRow {
  id: string;
  customerId: string | null;
  channel: string;
  externalThreadId: string;
  aiMode?: boolean;
  status?: string;
  assignedAgentId?: string | null;
  messages?: {
    id: string;
    direction: string;
    provenance: string;
    text: string | null;
    payload?: unknown;
    createdAt: Date;
  }[];
}

interface PriorMessage {
  conversationId: string;
  provenance: string;
  text: string | null;
  payload?: unknown;
  createdAt: Date;
}

function makeHarness(
  opts: {
    conversations?: Record<string, ConversationRow>;
    externalIdentities?: Record<string, { customerId: string; verifiedAt: Date | null }>;
    priorMessages?: PriorMessage[];
  } = {},
) {
  const conversations = opts.conversations ?? {};
  const externalIdentities = opts.externalIdentities ?? {};
  const priorMessages = opts.priorMessages ?? [];

  const conversationFindUnique = vi.fn(
    async ({ where }: { where: { id: string } }) => conversations[where.id] ?? null,
  );
  const externalIdentityFindUnique = vi.fn(
    async ({
      where,
    }: {
      where: { channel_externalId: { channel: string; externalId: string } };
    }) => {
      const { channel, externalId } = where.channel_externalId;
      return externalIdentities[`${channel}:${externalId}`] ?? null;
    },
  );

  const messageCreate = vi.fn().mockResolvedValue({ id: 'msg_new' });
  const messageFindFirst = vi
    .fn()
    .mockImplementation(
      async ({ where }: { where: { conversationId: string; provenance: string } }) => {
        const candidates = priorMessages
          .filter(
            (m) => m.conversationId === where.conversationId && m.provenance === where.provenance,
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return candidates[0] ?? null;
      },
    );
  const conversationUpdate = vi
    .fn()
    .mockImplementation(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const existing = conversations[where.id];
        if (!existing) throw new Error('no such conversation in fixture');
        Object.assign(existing, data);
        return existing;
      },
    );
  // Ordinary (non-continuation) inbound path — not this file's focus (covered by
  // scripts/e2e-connect.mjs against a real DB), but given a minimal working implementation so a
  // regression test proving the continuation branch is opt-in doesn't have to fake it away.
  const conversationUpsert = vi
    .fn()
    .mockImplementation(
      async ({ create }: { where: unknown; update: unknown; create: ConversationRow }) => {
        conversations[create.id] = { ...create };
        return conversations[create.id];
      },
    );

  const tx = {
    conversation: { upsert: conversationUpsert, update: conversationUpdate },
    message: { create: messageCreate, findFirst: messageFindFirst },
  };

  const prisma = {
    conversation: { findUnique: conversationFindUnique },
    externalIdentity: { findUnique: externalIdentityFindUnique },
  } as unknown as PrismaService;

  const uow = {
    execute: async (_actor: unknown, work: (ctx: UowContext) => Promise<unknown>) =>
      work({
        tx: tx as unknown as UowContext['tx'],
        correlationId: 'corr_1',
        emit: () => {},
        audit: () => {},
      }),
  } as unknown as UnitOfWork;

  const auctions = {} as unknown as AuctionService;
  const channel = { name: 'mock', send: vi.fn() } as unknown as MessageChannelProvider;

  const service = new ConnectService(prisma, uow, auctions, channel);
  return {
    service,
    conversations,
    conversationFindUnique,
    externalIdentityFindUnique,
    messageCreate,
    messageFindFirst,
    conversationUpdate,
    conversationUpsert,
  };
}

describe('ConnectService.inbound — AIC-2 continuation ingress (constraint 2)', () => {
  it('a continuation with a matching, verified identity attaches to the ORIGIN conversation — no duplicate row', async () => {
    const conversations = {
      conv_web_1: {
        id: 'conv_web_1',
        customerId: 'cust_1',
        channel: 'web',
        externalThreadId: 'web:cust_1:conv_web_1',
        aiMode: true,
      },
    };
    const externalIdentities = {
      'whatsapp:94771234567': { customerId: 'cust_1', verifiedAt: new Date() },
    };
    const { service, messageCreate } = makeHarness({ conversations, externalIdentities });

    const token = issueContinuityToken({ conversationId: 'conv_web_1', customerId: 'cust_1' });
    const result = await service.inbound(system, {
      channel: 'whatsapp',
      externalThreadId: 'wa-thread-brand-new',
      externalUserId: '94771234567',
      text: 'continuing here',
      continuityToken: token,
    });

    expect(result.conversationId).toBe('conv_web_1');
    expect((result as { continued?: boolean }).continued).toBe(true);
    expect(result.customerResolved).toBe(true);
    expect(Object.keys(conversations)).toEqual(['conv_web_1']); // still exactly ONE conversation

    expect(messageCreate).toHaveBeenCalledTimes(1);
    const [args] = messageCreate.mock.calls[0]!;
    expect(args.data.conversationId).toBe('conv_web_1');
    expect(args.data.provenance).toBe('customer');
    expect(args.data.direction).toBe('inbound');
  });

  it('preserves the origin conversation’s latest item-context subject into the continued message', async () => {
    const conversations = {
      conv_web_1: {
        id: 'conv_web_1',
        customerId: 'cust_1',
        channel: 'web',
        externalThreadId: 'web:cust_1:conv_web_1',
        aiMode: true,
      },
    };
    const externalIdentities = {
      'whatsapp:94771234567': { customerId: 'cust_1', verifiedAt: new Date() },
    };
    const subject = { listingId: 'listing_1', title: 'Vintage Rolex' };
    const priorMessages = [
      {
        conversationId: 'conv_web_1',
        provenance: 'customer',
        text: 'When does this lot close?',
        payload: { subject },
        createdAt: new Date('2026-08-01T00:00:00Z'),
      },
    ];
    const { service, messageCreate } = makeHarness({
      conversations,
      externalIdentities,
      priorMessages,
    });

    const token = issueContinuityToken({ conversationId: 'conv_web_1', customerId: 'cust_1' });
    await service.inbound(system, {
      channel: 'whatsapp',
      externalThreadId: 'wa-thread-2',
      externalUserId: '94771234567',
      text: 'still interested',
      continuityToken: token,
    });

    const [args] = messageCreate.mock.calls[0]!;
    expect(args.data.payload.subject).toEqual(subject);
  });

  it('a mismatched/cross-customer identity is denied (404) — the resolved customer does not own the origin conversation', async () => {
    const conversations = {
      conv_web_1: {
        id: 'conv_web_1',
        customerId: 'cust_1',
        channel: 'web',
        externalThreadId: 'web:cust_1:conv_web_1',
        aiMode: true,
      },
    };
    // A DIFFERENT customer's verified WhatsApp number tries to use cust_1's token.
    const externalIdentities = {
      'whatsapp:94779999999': { customerId: 'cust_2', verifiedAt: new Date() },
    };
    const {
      service,
      messageCreate,
      conversations: store,
    } = makeHarness({
      conversations,
      externalIdentities,
    });

    const token = issueContinuityToken({ conversationId: 'conv_web_1', customerId: 'cust_1' });
    await expect(
      service.inbound(system, {
        channel: 'whatsapp',
        externalThreadId: 'wa-thread-attacker',
        externalUserId: '94779999999',
        text: 'let me in',
        continuityToken: token,
      }),
    ).rejects.toThrow(NotFoundException);

    expect(messageCreate).not.toHaveBeenCalled();
    expect(store.conv_web_1!.customerId).toBe('cust_1'); // origin untouched
  });

  it('an unverified identity is denied (404) even with a valid token for the right customer', async () => {
    const conversations = {
      conv_web_1: {
        id: 'conv_web_1',
        customerId: 'cust_1',
        channel: 'web',
        externalThreadId: 'web:cust_1:conv_web_1',
        aiMode: true,
      },
    };
    const externalIdentities = {
      'whatsapp:94771234567': { customerId: 'cust_1', verifiedAt: null }, // linked, NOT verified
    };
    const { service, messageCreate } = makeHarness({ conversations, externalIdentities });

    const token = issueContinuityToken({ conversationId: 'conv_web_1', customerId: 'cust_1' });
    await expect(
      service.inbound(system, {
        channel: 'whatsapp',
        externalThreadId: 'wa-thread-3',
        externalUserId: '94771234567',
        text: 'hello',
        continuityToken: token,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(messageCreate).not.toHaveBeenCalled();
  });

  it('a malformed/garbage continuity token is denied (404)', async () => {
    const { service, messageCreate } = makeHarness();

    await expect(
      service.inbound(system, {
        channel: 'whatsapp',
        externalThreadId: 'wa-thread-4',
        externalUserId: '94771234567',
        text: 'hello',
        continuityToken: 'not-a-real-token',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(messageCreate).not.toHaveBeenCalled();
  });

  it('a token naming a conversation that does not exist is denied (404)', async () => {
    const externalIdentities = {
      'whatsapp:94771234567': { customerId: 'cust_1', verifiedAt: new Date() },
    };
    const { service, messageCreate } = makeHarness({ externalIdentities });

    const token = issueContinuityToken({ conversationId: 'ghost_conv', customerId: 'cust_1' });
    await expect(
      service.inbound(system, {
        channel: 'whatsapp',
        externalThreadId: 'wa-thread-5',
        externalUserId: '94771234567',
        text: 'hello',
        continuityToken: token,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(messageCreate).not.toHaveBeenCalled();
  });

  it('without a continuityToken, ordinary inbound is unaffected (no continuation branch taken)', async () => {
    const { service, conversationFindUnique, conversationUpsert } = makeHarness();
    // No continuityToken -> falls through to the ordinary upsert path, which does not consult
    // prisma.conversation.findUnique at all (only tx.conversation.upsert, exercised here).
    const result = await service.inbound(system, {
      channel: 'whatsapp',
      externalThreadId: 'wa-thread-plain',
      externalUserId: '94770000001',
      text: 'hi',
    });
    expect((result as { continued?: boolean }).continued).toBeUndefined();
    expect(conversationFindUnique).not.toHaveBeenCalled();
    expect(conversationUpsert).toHaveBeenCalledTimes(1);
  });
});

describe('ConnectService — human handoff context (AIC-2)', () => {
  it('after setMode(aiMode:false), conversation() still carries the FULL history + item-context (handoffSummary)', async () => {
    const subject = { listingId: 'listing_9', title: 'Antique Clock' };
    const conv: ConversationRow = {
      id: 'conv_h1',
      customerId: 'cust_1',
      channel: 'web',
      externalThreadId: 'web:cust_1:conv_h1',
      status: 'open',
      aiMode: true,
      assignedAgentId: null,
      messages: [
        {
          id: 'm1',
          direction: 'inbound',
          provenance: 'customer',
          text: 'Tell me about this lot',
          payload: { subject },
          createdAt: new Date('2026-08-01T00:00:00Z'),
        },
        {
          id: 'm2',
          direction: 'outbound',
          provenance: 'ai',
          text: 'A specialist can confirm the details.',
          payload: null,
          createdAt: new Date('2026-08-01T00:00:01Z'),
        },
      ],
    };
    const { service } = makeHarness({ conversations: { conv_h1: conv } });

    const staff: Principal = {
      customerId: 'staff_9',
      roles: [Role.Support],
      permissions: new Set(),
      aal: 'aal1',
    };
    const handoff = await service.setMode(staff, 'conv_h1', { aiMode: false });
    expect(handoff.aiMode).toBe(false);
    expect(handoff.assignedAgentId).toBeTruthy();

    const view = await service.conversation('conv_h1');
    expect(view.aiMode).toBe(false);
    expect(view.messages).toHaveLength(2); // full history preserved, nothing dropped/reset
    expect(view.messages[0]).toMatchObject({ text: 'Tell me about this lot' });
    expect((view.messages[0]!.payload as unknown as { subject?: unknown } | null)?.subject).toEqual(
      subject,
    );

    // Derived handoff summary — latest customer question + item-context, no new table.
    expect(view.handoffSummary).toEqual({
      latestQuestion: 'Tell me about this lot',
      itemContext: subject,
    });
  });

  it('conversation() with no customer message yet has a null handoffSummary (not an error)', async () => {
    const conv: ConversationRow = {
      id: 'conv_h2',
      customerId: 'cust_1',
      channel: 'web',
      externalThreadId: 'web:cust_1:conv_h2',
      status: 'open',
      aiMode: true,
      assignedAgentId: null,
      messages: [],
    };
    const { service } = makeHarness({ conversations: { conv_h2: conv } });

    const view = await service.conversation('conv_h2');
    expect(view.handoffSummary).toBeNull();
    expect(view.messages).toEqual([]);
  });
});
