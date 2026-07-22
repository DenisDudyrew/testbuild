import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import type { Socket } from 'socket.io';

let io: SocketIOServer | null = null;

interface TypingData {
  conversationId: string;
  userId: string;
  username: string;
}

interface MessageData {
  conversationId: string;
  message: any;
}

interface OnlineData {
  userId: string;
  online: boolean;
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

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket.IO] Connected: ${socket.id}`);

    // Аутентификация — регистрируем userId
    socket.on('register', (userId: string) => {
      if (!userId) return;
      socket.data.userId = userId;

      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId)!.add(socket.id);

      // Присоединяемся к комнатам чатов пользователя
      // (комнаты называются conversation:${convId})
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
      socket.leave(`conversation:${conversationId}`);
    });

    // Новое сообщение
    socket.on('message:send', (data: MessageData) => {
      io?.to(`conversation:${data.conversationId}`).emit('message:new', data.message);
      io?.to(`conversation:${data.conversationId}`).emit('conversation:update', {
        conversationId: data.conversationId,
        lastMessage: data.message,
      });
    });

    // Печатает...
    let typingTimeout: NodeJS.Timeout | null = null;
    socket.on('typing:start', (data: TypingData) => {
      socket.to(`conversation:${data.conversationId}`).emit('typing:update', {
        conversationId: data.conversationId,
        typing: [{ id: data.userId, username: data.username }],
      });

      // Авто-очистка через 5 секунд
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        socket.to(`conversation:${data.conversationId}`).emit('typing:update', {
          conversationId: data.conversationId,
          typing: [],
        });
      }, 5000);
    });

    socket.on('typing:stop', (data: { conversationId: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit('typing:update', {
        conversationId: data.conversationId,
        typing: [],
      });
    });

    // Онлайн-статус
    socket.on('online:heartbeat', (userId: string) => {
      // Уведомляем все комнаты пользователя
      socket.broadcast.emit('online:update', { userId, online: true });
    });

    // Отключение
    socket.on('disconnect', () => {
      const userId = socket.data.userId;
      if (userId && userSockets.has(userId)) {
        userSockets.get(userId)!.delete(socket.id);
        if (userSockets.get(userId)!.size === 0) {
          userSockets.delete(userId);
          // Уведомляем, что пользователь офлайн
          socket.broadcast.emit('online:update', { userId, online: false });
        }
      }
      console.log(`[Socket.IO] Disconnected: ${socket.id}`);
    });
  });

  console.log('[Socket.IO] Server initialized');
  return io;
}
