import { vi, type Mock } from 'vitest';

// Типы для удобства
interface MockModel {
  findUnique: Mock;
  findMany: Mock;
  findFirst: Mock;
  create: Mock;
  update: Mock;
  delete: Mock;
  deleteMany: Mock;
  count: Mock;
  upsert: Mock;
  updateMany: Mock;
}

interface MockPrisma {
  user: MockModel;
  post: MockModel;
  like: MockModel;
  comment: MockModel;
  commentLike: MockModel;
  notification: MockModel;
  follow: MockModel;
  bookmark: MockModel;
  hashtag: MockModel;
  postHashtag: MockModel;
  poll: MockModel;
  pollOption: MockModel;
  vote: MockModel;
  releaseNote: MockModel;
  conversation: MockModel;
  conversationParticipant: MockModel;
  message: MockModel;
  messageReaction: MockModel;
  pinnedMessage: MockModel;
  messageEditHistory: MockModel;
  messageDeliveryStatus: MockModel;
  userBlock: MockModel;
  $disconnect: Mock;
  $transaction: Mock;
  $queryRawUnsafe: Mock;
}

// Создаём моки на уровне модуля (vi.hoisted выполняется до vi.mock)
const { createMockPrisma, createMockAuth } = vi.hoisted(() => {
  function createMockModel() {
    return {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    };
  }

  function createMockPrisma() {
    return {
      user: createMockModel(),
      post: createMockModel(),
      like: createMockModel(),
      comment: createMockModel(),
      commentLike: createMockModel(),
      notification: createMockModel(),
      follow: createMockModel(),
      bookmark: createMockModel(),
      hashtag: createMockModel(),
      postHashtag: createMockModel(),
      poll: createMockModel(),
      pollOption: createMockModel(),
      vote: createMockModel(),
      releaseNote: createMockModel(),
      conversation: createMockModel(),
      conversationParticipant: createMockModel(),
      message: createMockModel(),
      messageReaction: createMockModel(),
      pinnedMessage: createMockModel(),
      messageEditHistory: createMockModel(),
      messageDeliveryStatus: createMockModel(),
      userBlock: createMockModel(),
    $disconnect: vi.fn(),
    $transaction: vi.fn((fn: (prisma: MockPrisma) => unknown): unknown => fn(mockPrisma)),
    $queryRawUnsafe: vi.fn(),
    };
  }

  function createMockAuth() {
    return {
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    };
  }

  return { createMockPrisma, createMockAuth };
});

// Создаём экземпляры моков (до vi.mock, который будет вызван в тестах)
export const mockPrisma = createMockPrisma();
export const mockAuth = createMockAuth();

// Настраиваем моки модулей (vi.mock будет поднят наверх)
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/auth', () => mockAuth);

/**
 * Сбросить все моки перед тестом.
 */
export function resetMocks(): void {
  vi.resetAllMocks();
}

/**
 * Установить сессию пользователя.
 * @param userId ID пользователя (null = неавторизован)
 */
export function setAuthSession(userId: string | null = 'test-user-id'): void {
  if (userId) {
    mockAuth.auth.mockResolvedValue({
      user: { id: userId, name: 'testuser', role: 'user' },
    });
  } else {
    mockAuth.auth.mockResolvedValue(null);
  }
}

/**
 * Создать Request объект с JSON body.
 */
export function createJsonRequest(
  url: string = 'http://localhost:3000',
  body?: unknown,
  headers?: Record<string, string>
): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Создать GET Request.
 */
export function createGetRequest(
  url: string = 'http://localhost:3000',
  headers?: Record<string, string>
): Request {
  return new Request(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
