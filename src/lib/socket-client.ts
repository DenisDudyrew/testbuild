'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import io from 'socket.io-client';

type MessageHandler = (message: any) => void;
type TypingHandler = (data: { conversationId: string; typing: { id: string; username: string }[] }) => void;
type OnlineHandler = (data: { userId: string; online: boolean }) => void;
type ConversationUpdateHandler = (data: { conversationId: string; lastMessage: any }) => void;

interface SocketHandlers {
  onMessageNew?: MessageHandler;
  onTypingUpdate?: TypingHandler;
  onOnlineUpdate?: OnlineHandler;
  onConversationUpdate?: ConversationUpdateHandler;
}

export function useSocket(userId: string | undefined, handlers: SocketHandlers) {
  const socketRef = useRef<any>(null);
  const handlersRef = useRef(handlers);
  const [connected, setConnected] = useState(false);
  handlersRef.current = handlers;

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

    socket.on('message:new', (message: any) => {
      handlersRef.current.onMessageNew?.(message);
    });

    socket.on('typing:update', (data: { conversationId: string; typing: { id: string; username: string }[] }) => {
      handlersRef.current.onTypingUpdate?.(data);
    });

    socket.on('online:update', (data: { userId: string; online: boolean }) => {
      handlersRef.current.onOnlineUpdate?.(data);
    });

    socket.on('conversation:update', (data: { conversationId: string; lastMessage: any }) => {
      handlersRef.current.onConversationUpdate?.(data);
    });

    socket.on('disconnect', () => {
      console.log('[Socket.IO] Disconnected');
      setConnected(false);
    });

    return () => {
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

  const sendMessage = useCallback((conversationId: string, message: any) => {
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

  return {
    joinConversation,
    leaveConversation,
    sendMessage,
    sendTyping,
    stopTyping,
    sendHeartbeat,
    connected,
  };
}

export function getSocket(): any {
  return null;
}
