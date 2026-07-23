import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import type { Socket } from 'socket.io';

let io: SocketIOServer | null = null;

interface TypingData {
  conversationId: string;
  userId: string;
  username: string;
}

interface MessagePayload {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
  sender: { id: string; username: string; avatar: string | null };
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaName?: string | null;
  replyTo?: { id: string; content: string; senderId: string; sender: { id: string; username: string } } | null;
  reactions?: Array<{ id: string; emoji: string; userId: string; user: { id: string; username: string } }>;
  editedAt?: string | null;
  pinnedBy?: { id: string } | null;
}

interface MessageData {
  conversationId: string;
  message: MessagePayload;
}

// Rate limiter state per socket
interface SocketRateLimit {
  messageCount: number;
  typingCount: number;
  windowStart: number;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_MESSAGES_PER_WINDOW = 30;
const MAX_TYPING_PER_WINDOW = 60;

function checkSocketRateLimit(socket: Socket, type: 'message' | 'typing'): boolean {
  const key = `ratelimit:${socket.id}`;
  const now = Date.now();
  const record: SocketRateLimit = socket.data[key] || { messageCount: 0, typingCount: 0, windowStart: now };

  if (now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    record.messageCount = 0;
    record.typingCount = 0;
    record.windowStart = now;
  }

  if (type === 'message') {
    record.messageCount++;
    if (record.messageCount > MAX_MESSAGES_PER_WINDOW) return false;
  } else {
    record.typingCount++;
    if (record.typingCount > MAX_TYPING_PER_WINDOW) return false;
  }

  socket.data[key] = record;
  return true;
}

export function getIO(): SocketIOServer | null {
  return io;
}

export function initSocketIO(server: HTTPServer) {
  if (io) return io;

  io = new SocketIOServer(server, {
    path: '/api/socketio',
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Map userId -> Set<socketId>
  const userSockets = new Map<string, Set<string>>();

  // Map conversationId -> Map<userId, { username, timeout }>
  const typingUsers = new Map<string, Map<string, { username: string; timeout: NodeJS.Timeout }>>();

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket.IO] Connected: ${socket.id}`);

    // Аутентификация — регистрируем userId
    socket.on('register', (userId: string) => {
      if (!userId || typeof userId !== 'string') return;
      socket.data.userId = userId;

      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId)!.add(socket.id);

      socket.join(`user:${userId}`);
      console.log(`[Socket.IO] Registered user ${userId} (socket ${socket.id})`);
    });

    // Присоединиться к комнате чата
    socket.on('join:conversation', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
      console.log(`[Socket.IO] Socket ${socket.id} joined conversation ${conversationId}`);
    });

    // Покинуть комнату чата
    socket.on('leave:conversation', (conversationId: string) => {
      // Очищаем typing при выходе
      clearTypingForSocket(socket, conversationId);
      socket.leave(`conversation:${conversationId}`);
    });

    // Новое сообщение — транслируем только другим участникам (не отправителю)
    socket.on('message:send', (data: MessageData) => {
      // 1. Проверка авторизации
      const userId = socket.data.userId;
      if (!userId) {
        socket.emit('error', { code: 'UNAUTHORIZED', message: 'Register first' });
        return;
      }

      // 2. Валидация — sender должен совпадать с зарегистрированным userId
      if (!data?.message?.senderId || data.message.senderId !== userId) {
        socket.emit('error', { code: 'FORBIDDEN', message: 'Sender ID mismatch' });
        return;
      }

      // 3. Rate limiting
      if (!checkSocketRateLimit(socket, 'message')) {
        socket.emit('error', { code: 'RATE_LIMITED', message: 'Too many messages. Slow down.' });
        return;
      }

      // broadcast.to — исключает отправителя, чтобы не было дубликата
      socket.broadcast.to(`conversation:${data.conversationId}`).emit('message:new', data.message);
      socket.broadcast.to(`conversation:${data.conversationId}`).emit('conversation:update', {
        conversationId: data.conversationId,
        lastMessage: data.message,
      });
    });

    // Печатает... (поддерживает multiple users)
    socket.on('typing:start', (data: TypingData) => {
      // 1. Проверка авторизации
      const userId = socket.data.userId;
      if (!userId) {
        socket.emit('error', { code: 'UNAUTHORIZED', message: 'Register first' });
        return;
      }

      // 2. Валидация — нельзя подделать чужой userId
      if (!data?.userId || data.userId !== userId) {
        socket.emit('error', { code: 'FORBIDDEN', message: 'User ID mismatch' });
        return;
      }

      // 3. Rate limiting
      if (!checkSocketRateLimit(socket, 'typing')) return;

      const { conversationId, username } = data;

      // 4. Храним typing пользователей в Map
      if (!typingUsers.has(conversationId)) {
        typingUsers.set(conversationId, new Map());
      }

      const convTyping = typingUsers.get(conversationId)!;

      // Удаляем старый таймаут
      const existing = convTyping.get(userId);
      if (existing) clearTimeout(existing.timeout);

      // Устанавливаем новый таймаут (5 сек)
      const timeout = setTimeout(() => {
        convTyping.delete(userId);
        if (convTyping.size === 0) {
          typingUsers.delete(conversationId);
        }
        broadcastTyping(conversationId, convTyping);
      }, 5000);

      convTyping.set(userId, { username, timeout });

      // Шлём актуальный список всем в комнате (кроме отправителя)
      socket.to(`conversation:${conversationId}`).emit('typing:update', {
        conversationId,
        typing: getTypingList(convTyping, userId),
      });
    });

    socket.on('typing:stop', (data: { conversationId: string }) => {
      const userId = socket.data.userId;
      if (!userId || !data?.conversationId) return;

      clearTypingForSocket(socket, data.conversationId);
    });

    // Онлайн-статус
    socket.on('online:heartbeat', (userId: string) => {
      // Валидация: только свой heartbeat
      if (!userId || userId !== socket.data.userId) return;
      socket.data.lastHeartbeat = Date.now();
      socket.broadcast.emit('online:update', { userId, online: true });
    });

    // Отключение
    socket.on('disconnect', () => {
      const userId = socket.data.userId;
      if (userId && userSockets.has(userId)) {
        userSockets.get(userId)!.delete(socket.id);
        if (userSockets.get(userId)!.size === 0) {
          userSockets.delete(userId);
          socket.broadcast.emit('online:update', { userId, online: false });
        }
      }

      // Очищаем typing при отключении
      for (const [convId, convTyping] of typingUsers.entries()) {
        if (convTyping.has(userId)) {
          clearTimeout(convTyping.get(userId)!.timeout);
          convTyping.delete(userId);
          if (convTyping.size === 0) {
            typingUsers.delete(convId);
          } else {
            broadcastTyping(convId, convTyping);
          }
        }
      }

      console.log(`[Socket.IO] Disconnected: ${socket.id}`);
    });
  });

  function getTypingList(
    convTyping: Map<string, { username: string; timeout: NodeJS.Timeout }>,
    excludeUserId?: string
  ): Array<{ id: string; username: string }> {
    const list: Array<{ id: string; username: string }> = [];
    for (const [uid, val] of convTyping) {
      if (uid !== excludeUserId) {
        list.push({ id: uid, username: val.username });
      }
    }
    return list;
  }

  function broadcastTyping(
    conversationId: string,
    convTyping: Map<string, { username: string; timeout: NodeJS.Timeout }>
  ) {
    const typingList = getTypingList(convTyping);
    io?.to(`conversation:${conversationId}`).emit('typing:update', {
      conversationId,
      typing: typingList,
    });
  }

  function clearTypingForSocket(socket: Socket, conversationId: string) {
    const userId = socket.data.userId;
    if (!userId) return;

    const convTyping = typingUsers.get(conversationId);
    if (!convTyping) return;

    const existing = convTyping.get(userId);
    if (existing) {
      clearTimeout(existing.timeout);
      convTyping.delete(userId);
    }

    if (convTyping.size === 0) {
      typingUsers.delete(conversationId);
    }

    broadcastTyping(conversationId, convTyping);
  }

  console.log('[Socket.IO] Server initialized');
  return io;
}
