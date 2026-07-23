'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import io from 'socket.io-client';

interface MessageData {
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

type MessageHandler = (message: MessageData) => void;
type TypingHandler = (data: { conversationId: string; typing: { id: string; username: string }[] }) => void;
type OnlineHandler = (data: { userId: string; online: boolean }) => void;
type ConversationUpdateHandler = (data: { conversationId: string; lastMessage: MessageData }) => void;

interface SocketHandlers {
  onMessageNew?: MessageHandler;
  onTypingUpdate?: TypingHandler;
  onOnlineUpdate?: OnlineHandler;
  onConversationUpdate?: ConversationUpdateHandler;
}

export function useSocket(userId: string | undefined, handlers: SocketHandlers) {
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const handlersRef = useRef(handlers);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!userId) return;

    // Создаём соединение
    const socket = io({
      path: '/api/socketio',
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket.IO] Connected');
      setConnected(true);
      socket.emit('register', userId);
    });

    socket.on('message:new', (message: MessageData) => {
      handlersRef.current.onMessageNew?.(message);
    });

    socket.on('typing:update', (data: { conversationId: string; typing: { id: string; username: string }[] }) => {
      handlersRef.current.onTypingUpdate?.(data);
    });

    socket.on('online:update', (data: { userId: string; online: boolean }) => {
      handlersRef.current.onOnlineUpdate?.(data);
    });

    socket.on('conversation:update', (data: { conversationId: string; lastMessage: MessageData }) => {
      handlersRef.current.onConversationUpdate?.(data);
    });

    socket.on('disconnect', () => {
      console.log('[Socket.IO] Disconnected');
      setConnected(false);
    });

    // Авто-запуск heartbeat при подключении
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    socket.on('connect', () => {
      heartbeatInterval = setInterval(() => {
        socket.emit('online:heartbeat', userId);
      }, 30000);
    });

    return () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId]);

  const joinConversation = useCallback((conversationId: string) => {
    socketRef.current?.emit('join:conversation', conversationId);
  }, []);

  const leaveConversation = useCallback((conversationId: string) => {
    socketRef.current?.emit('leave:conversation', conversationId);
  }, []);

  const sendMessage = useCallback((conversationId: string, message: MessageData) => {
    socketRef.current?.emit('message:send', { conversationId, message });
  }, []);

  const sendTyping = useCallback((conversationId: string, userId: string, username: string) => {
    socketRef.current?.emit('typing:start', { conversationId, userId, username });
  }, []);

  const stopTyping = useCallback((conversationId: string) => {
    socketRef.current?.emit('typing:stop', { conversationId });
  }, []);

  const sendHeartbeat = useCallback((userId: string) => {
    socketRef.current?.emit('online:heartbeat', userId);
  }, []);

  return useMemo(() => ({
    joinConversation,
    leaveConversation,
    sendMessage,
    sendTyping,
    stopTyping,
    sendHeartbeat,
    connected,
  }), [joinConversation, leaveConversation, sendMessage, sendTyping, stopTyping, sendHeartbeat, connected]);
}

export function getSocket() {
  return null;
}
