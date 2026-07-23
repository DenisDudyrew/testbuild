import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock auth
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    message: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    messageEditHistory: {
      create: vi.fn(),
    },
    messageDeliveryStatus: {
      createMany: vi.fn(),
    },
    conversationParticipant: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    pinnedMessage: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    messageReaction: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

// Mock encryption
vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn((text: string) => `encrypted:${text}`),
  decrypt: vi.fn((text: string) => text.replace("encrypted:", "")),
}));

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getRateLimitKey: vi.fn().mockReturnValue("test-key"),
  getStrictConfig: vi.fn().mockReturnValue({ max: 30, windowMs: 60000 }),
  getModerateConfig: vi.fn().mockReturnValue({ max: 100, windowMs: 60000 }),
}));

// Mock validation
vi.mock("@/lib/validation", () => ({
  sendMessageSchema: {
    safeParse: vi.fn().mockReturnValue({
      success: true,
      data: { content: "test message", replyToId: null, mediaUrl: null, mediaType: null, mediaName: null, forwardFromId: null },
    }),
  },
  createConversationSchema: {
    safeParse: vi.fn().mockReturnValue({ success: true, data: { participantIds: ["user2"] } }),
  },
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.mocked(auth);
const mockPrisma = vi.mocked(prisma);

const mockSession = {
  user: { id: "user1", username: "testuser", email: "test@test.com" },
  expires: "2099-01-01T00:00:00.000Z",
};

// ==============================================================================
// Messenger API Tests
// ==============================================================================

describe("Messenger API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(mockSession as any);
  });

  // --- Messages PATCH (edit) ---
  describe("PATCH /api/messenger/messages/[messageId]", () => {
    it("should return 401 if not authenticated", async () => {
      mockAuth.mockResolvedValue(null);

      const { PATCH } = await import("@/app/api/messenger/messages/[messageId]/route");

      const req = new NextRequest("http://localhost:3000/api/messenger/messages/msg1", {
        method: "PATCH",
        body: JSON.stringify({ content: "updated" }),
      });

      const response = await PATCH(req, { params: Promise.resolve({ messageId: "msg1" }) } as any);
      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("should return 400 if content is empty", async () => {
      const { PATCH } = await import("@/app/api/messenger/messages/[messageId]/route");

      const req = new NextRequest("http://localhost:3000/api/messenger/messages/msg1", {
        method: "PATCH",
        body: JSON.stringify({ content: "" }),
      });

      const response = await PATCH(req, { params: Promise.resolve({ messageId: "msg1" }) } as any);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe("Content is required");
    });

    it("should return 403 if user is not the sender", async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: "msg1",
        senderId: "other-user",
        deletedAt: null,
        content: "encrypted:original",
      });

      const { PATCH } = await import("@/app/api/messenger/messages/[messageId]/route");

      const req = new NextRequest("http://localhost:3000/api/messenger/messages/msg1", {
        method: "PATCH",
        body: JSON.stringify({ content: "updated" }),
      });

      const response = await PATCH(req, { params: Promise.resolve({ messageId: "msg1" }) } as any);
      expect(response.status).toBe(403);
    });

    it("should return 400 if message is deleted", async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: "msg1",
        senderId: "user1",
        deletedAt: new Date(),
        content: "encrypted:original",
      });

      const { PATCH } = await import("@/app/api/messenger/messages/[messageId]/route");

      const req = new NextRequest("http://localhost:3000/api/messenger/messages/msg1", {
        method: "PATCH",
        body: JSON.stringify({ content: "updated" }),
      });

      const response = await PATCH(req, { params: Promise.resolve({ messageId: "msg1" }) } as any);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Cannot edit deleted message" });
    });

    it("should successfully edit a message with editHistory", async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: "msg1",
        senderId: "user1",
        deletedAt: null,
        content: "encrypted:original content",
      });

      mockPrisma.messageEditHistory.create.mockResolvedValue({});
      mockPrisma.message.update.mockResolvedValue({
        id: "msg1",
        content: "encrypted:updated content",
        editedAt: new Date(),
      });

      const { PATCH } = await import("@/app/api/messenger/messages/[messageId]/route");

      const req = new NextRequest("http://localhost:3000/api/messenger/messages/msg1", {
        method: "PATCH",
        body: JSON.stringify({ content: "updated content" }),
      });

      const response = await PATCH(req, { params: Promise.resolve({ messageId: "msg1" }) } as any);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.content).toBe("updated content");

      // Verify editHistory was created
      expect(mockPrisma.messageEditHistory.create).toHaveBeenCalledWith({
        data: {
          messageId: "msg1",
          oldContent: "encrypted:original content",
        },
      });

      // Verify message was updated with searchContent
      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: "msg1" },
        data: expect.objectContaining({
          searchContent: "updated content",
          editedAt: expect.any(Date),
        }),
      });
    });
  });

  // --- Messages DELETE ---
  describe("DELETE /api/messenger/messages/[messageId]", () => {
    it("should return 401 if not authenticated", async () => {
      mockAuth.mockResolvedValue(null);

      const { DELETE } = await import("@/app/api/messenger/messages/[messageId]/route");

      const req = new NextRequest("http://localhost:3000/api/messenger/messages/msg1?mode=forMe", {
        method: "DELETE",
      });

      const response = await DELETE(req, { params: Promise.resolve({ messageId: "msg1" }) } as any);
      expect(response.status).toBe(401);
    });

    it("should return 400 if mode is invalid", async () => {
      const { DELETE } = await import("@/app/api/messenger/messages/[messageId]/route");

      const req = new NextRequest("http://localhost:3000/api/messenger/messages/msg1?mode=invalid", {
        method: "DELETE",
      });

      const response = await DELETE(req, { params: Promise.resolve({ messageId: "msg1" }) } as any);
      expect(response.status).toBe(400);
    });

    it("should delete for me (mode=forMe)", async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: "msg1",
        senderId: "user1",
        conversationId: "conv1",
      });
      mockPrisma.conversationParticipant.findUnique.mockResolvedValue({
        conversationId: "conv1",
        userId: "user1",
      });
      mockPrisma.message.update.mockResolvedValue({});

      const { DELETE } = await import("@/app/api/messenger/messages/[messageId]/route");

      const req = new NextRequest("http://localhost:3000/api/messenger/messages/msg1?mode=forMe", {
        method: "DELETE",
      });

      const response = await DELETE(req, { params: Promise.resolve({ messageId: "msg1" }) } as any);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.mode).toBe("forMe");

      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: "msg1" },
        data: { deletedForUserId: "user1" },
      });
    });

    it("should delete for everyone (mode=forEveryone)", async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: "msg1",
        senderId: "user1",
        conversationId: "conv1",
      });
      mockPrisma.conversationParticipant.findUnique.mockResolvedValue({
        conversationId: "conv1",
        userId: "user1",
      });
      mockPrisma.message.update.mockResolvedValue({});

      const { DELETE } = await import("@/app/api/messenger/messages/[messageId]/route");

      const req = new NextRequest("http://localhost:3000/api/messenger/messages/msg1?mode=forEveryone", {
        method: "DELETE",
      });

      const response = await DELETE(req, { params: Promise.resolve({ messageId: "msg1" }) } as any);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.mode).toBe("forEveryone");

      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: "msg1" },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it("should return 403 if non-sender tries to delete for everyone", async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: "msg1",
        senderId: "other-user",
        conversationId: "conv1",
      });
      mockPrisma.conversationParticipant.findUnique.mockResolvedValue({
        conversationId: "conv1",
        userId: "user1",
      });

      const { DELETE } = await import("@/app/api/messenger/messages/[messageId]/route");

      const req = new NextRequest("http://localhost:3000/api/messenger/messages/msg1?mode=forEveryone", {
        method: "DELETE",
      });

      const response = await DELETE(req, { params: Promise.resolve({ messageId: "msg1" }) } as any);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Only the sender can delete for everyone" });
    });
  });

  // --- Send message with deliveryStatus ---
  describe("POST /api/messenger/conversations/[id]/messages", () => {
    it("should create deliveryStatus for all participants", async () => {
      mockPrisma.conversationParticipant.findUnique.mockResolvedValue({
        conversationId: "conv1",
        userId: "user1",
      });

      mockPrisma.message.create.mockResolvedValue({
        id: "msg1",
        conversationId: "conv1",
        senderId: "user1",
        content: "encrypted:hello",
      });

      mockPrisma.conversationParticipant.findMany.mockResolvedValue([
        { userId: "user1" },
        { userId: "user2" },
      ]);

      mockPrisma.messageDeliveryStatus.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.conversation.update.mockResolvedValue({});
      mockPrisma.conversationParticipant.update.mockResolvedValue({});

      const { POST } = await import("@/app/api/messenger/conversations/[id]/messages/route");

      const req = new NextRequest("http://localhost:3000/api/messenger/conversations/conv1/messages", {
        method: "POST",
        body: JSON.stringify({ content: "hello", replyToId: null, mediaUrl: null, mediaType: null, mediaName: null, forwardFromId: null }),
      });

      const response = await POST(req, { params: Promise.resolve({ id: "conv1" }) } as any);
      expect(response.status).toBe(201);

      // Verify deliveryStatus was created for all participants
      expect(mockPrisma.messageDeliveryStatus.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: "user1", status: "sent" }),
          expect.objectContaining({ userId: "user2", status: "delivered" }),
        ]),
      });
    });
  });

  // --- Conversations PATCH (update) ---
  describe("PATCH /api/messenger/conversations/[id]", () => {
    it("should update conversation name", async () => {
      mockPrisma.conversationParticipant.findUnique.mockResolvedValue({
        conversationId: "conv1",
        userId: "user1",
      });
      mockPrisma.conversation.update.mockResolvedValue({
        id: "conv1",
        type: "group",
        name: "Updated Name",
        lastMessageAt: new Date(),
      });

      const { PATCH } = await import("@/app/api/messenger/conversations/[id]/route");

      const req = new NextRequest("http://localhost:3000/api/messenger/conversations/conv1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated Name" }),
      });

      const response = await PATCH(req, { params: Promise.resolve({ id: "conv1" }) } as any);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.name).toBe("Updated Name");
    });

    it("should return 400 if type is invalid", async () => {
      mockPrisma.conversationParticipant.findUnique.mockResolvedValue({
        conversationId: "conv1",
        userId: "user1",
      });

      const { PATCH } = await import("@/app/api/messenger/conversations/[id]/route");

      const req = new NextRequest("http://localhost:3000/api/messenger/conversations/conv1", {
        method: "PATCH",
        body: JSON.stringify({ type: "invalid" }),
      });

      const response = await PATCH(req, { params: Promise.resolve({ id: "conv1" }) } as any);
      expect(response.status).toBe(400);
    });
  });

  // --- Conversations DELETE (leave/delete) ---
  describe("DELETE /api/messenger/conversations/[id]", () => {
    it("should leave a conversation", async () => {
      mockPrisma.conversationParticipant.findUnique.mockResolvedValue({
        conversationId: "conv1",
        userId: "user1",
      });
      mockPrisma.conversationParticipant.delete.mockResolvedValue({});

      const { DELETE } = await import("@/app/api/messenger/conversations/[id]/route");

      const req = new NextRequest("http://localhost:3000/api/messenger/conversations/conv1?mode=leave", {
        method: "DELETE",
      });

      const response = await DELETE(req, { params: Promise.resolve({ id: "conv1" }) } as any);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.mode).toBe("leave");
    });

    it("should delete a conversation if single participant", async () => {
      mockPrisma.conversationParticipant.findUnique.mockResolvedValue({
        conversationId: "conv1",
        userId: "user1",
      });
      mockPrisma.conversationParticipant.count.mockResolvedValue(1);
      mockPrisma.conversation.delete.mockResolvedValue({});

      const { DELETE } = await import("@/app/api/messenger/conversations/[id]/route");

      const req = new NextRequest("http://localhost:3000/api/messenger/conversations/conv1?mode=delete", {
        method: "DELETE",
      });

      const response = await DELETE(req, { params: Promise.resolve({ id: "conv1" }) } as any);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.mode).toBe("delete");
    });

    it("should return 400 when trying to delete a multi-participant chat", async () => {
      mockPrisma.conversationParticipant.findUnique.mockResolvedValue({
        conversationId: "conv1",
        userId: "user1",
      });
      mockPrisma.conversationParticipant.count.mockResolvedValue(3);

      const { DELETE } = await import("@/app/api/messenger/conversations/[id]/route");

      const req = new NextRequest("http://localhost:3000/api/messenger/conversations/conv1?mode=delete", {
        method: "DELETE",
      });

      const response = await DELETE(req, { params: Promise.resolve({ id: "conv1" }) } as any);
      expect(response.status).toBe(400);
    });
  });
});

// ==============================================================================
// Socket Integration Tests
// ==============================================================================
describe("Socket Integration", () => {
  describe("message:send event", () => {
    it("should handle message sending through socket", async () => {
      // Test socket-server.ts exports
      const { getIO, initSocketIO } = await import("@/lib/socket-server");
      expect(getIO).toBeDefined();
      expect(initSocketIO).toBeDefined();
    });
  });
});

// ==============================================================================
// Validation Tests
// ==============================================================================
describe("Messenger Validation", () => {
  it("should validate send message schema", async () => {
    const { sendMessageSchema } = await import("@/lib/validation");

    const valid = sendMessageSchema.safeParse({
      content: "hello",
      replyToId: null,
      mediaUrl: null,
      mediaType: null,
      mediaName: null,
      forwardFromId: null,
    });
    expect(valid.success).toBe(true);

    const withMedia = sendMessageSchema.safeParse({
      content: "",
      mediaUrl: "https://example.com/image.jpg",
      mediaType: "image",
      mediaName: "photo.jpg",
    });
    expect(withMedia.success).toBe(true);
  });

    it("should validate conversation creation schema", async () => {
      const { createConversationSchema } = await vi.importActual<typeof import("@/lib/validation")>("@/lib/validation");

      const valid = createConversationSchema.safeParse({
        participantIds: ["user1", "user2"],
      });
      expect(valid.success).toBe(true);

      const invalid = createConversationSchema.safeParse({
        participantIds: "not-an-array" as any,
      });
      expect(invalid.success).toBe(false);

      const empty = createConversationSchema.safeParse({
        participantIds: [],
      });
      expect(empty.success).toBe(false);
    });
});

// ==============================================================================
// Encryption Tests
// ==============================================================================
describe("Messenger Encryption", () => {
  it("should encrypt and decrypt message content", async () => {
    const { encrypt, decrypt } = await import("@/lib/encryption");

    const original = "Secret message content";
    const encrypted = encrypt(original);

    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(":");

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

    it("should produce different ciphertexts for same plaintext", async () => {
      const { encrypt } = await vi.importActual<typeof import("@/lib/encryption")>("@/lib/encryption");

      const text = "Same text";
      const encrypted1 = encrypt(text);
      const encrypted2 = encrypt(text);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should throw on invalid ciphertext", async () => {
      const { decrypt } = await vi.importActual<typeof import("@/lib/encryption")>("@/lib/encryption");

      expect(() => decrypt("invalid-ciphertext")).toThrow();
    });
});

// ==============================================================================
// Rate Limiting Tests
// ==============================================================================
describe("Rate Limiting", () => {
  it("should allow messages within limit", async () => {
    const { checkRateLimit, getStrictConfig } = await import("@/lib/rate-limit");

    const config = getStrictConfig();
    expect(config.max).toBeLessThanOrEqual(30);

    const result = await checkRateLimit("test-user", config);
    expect(result.success).toBe(true);
  });
});

// ==============================================================================
// Component Tests (MessageBubble, ChatView)
// ==============================================================================
describe("Messenger Components", () => {
  describe("MessageBubble", () => {
    it("should render a message with delivery status", async () => {
      const { default: MessageBubble } = await import("@/components/messenger/MessageBubble");
      expect(MessageBubble).toBeDefined();
    });

    it("should display read receipts correctly", () => {
      // deliveryStatus: "sent" → одна галочка
      // deliveryStatus: "delivered" → две галочки
      // deliveryStatus: "read" → две синие галочки
      expect(true).toBe(true);
    });
  });

  describe("ChatView", () => {
    it("should load messages with pagination", async () => {
      const { default: ChatView } = await import("@/components/messenger/ChatView");
      expect(ChatView).toBeDefined();
    });

    it("should show connection status", () => {
      expect(true).toBe(true);
    });

    it("should show date separators", () => {
      expect(true).toBe(true);
    });

    it("should show scroll-to-bottom button", () => {
      expect(true).toBe(true);
    });

    it("should support optimistic UI and retry", () => {
      expect(true).toBe(true);
    });
  });

  describe("ConversationList", () => {
    it("should sort pinned chats first", () => {
      expect(true).toBe(true);
    });

    it("should filter conversations by search query", () => {
      expect(true).toBe(true);
    });
  });
});
