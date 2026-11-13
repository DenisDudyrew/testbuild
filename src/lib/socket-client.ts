'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface MessageData {
  id: string;
  conversationId?: string;
  tempId?: string;
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
interface SocketHandlers {
  onMessageNew?: (message: MessageData) => void;
  onMessagesChanged?: (data: { conversationId: string; messageId?: string }) => void;
  onReconnect?: () => void;
  onTypingUpdate?: (data: { conversationId: string; typing: { id: string; username: string }[] }) => void;
  onConversationUpdate?: (data: { conversationId: string }) => void;
}
// Same UI interface, backed by Go's authenticated SSE stream and HTTP commands.
export function useSocket(userId: string | undefined, handlers: SocketHandlers) {
  const handlersRef = useRef(handlers);
  const [connected, setConnected] = useState(false);
  useEffect(() => { handlersRef.current = handlers; }, [handlers]);
  useEffect(() => {
    if (!userId) return;
    const source = new EventSource('/api/events');
    source.onopen = () => { setConnected(true); handlersRef.current.onReconnect?.(); };
    source.onerror = () => setConnected(false);
    const listen = (name: string, callback: (data: unknown) => void) => source.addEventListener(name, event => {
      try { callback(JSON.parse((event as MessageEvent).data)); } catch { /* resync on reconnect/poll */ }
    });
    listen('message:new', data => handlersRef.current.onMessageNew?.(data as MessageData));
    listen('messages:changed', data => handlersRef.current.onMessagesChanged?.(data as { conversationId: string; messageId?: string }));
    listen('conversation:update', data => handlersRef.current.onConversationUpdate?.(data as { conversationId: string }));
    listen('typing:update', data => handlersRef.current.onTypingUpdate?.(data as { conversationId: string; typing: { id: string; username: string }[] }));
    const heartbeat = () => { void fetch('/api/users/me/last-seen', { method: 'POST' }).catch(() => {}); };
    heartbeat();
    const interval = setInterval(heartbeat, 30000);
    return () => { source.close(); clearInterval(interval); };
  }, [userId]);
  const joinConversation = useCallback((_id: string) => { void _id; }, []);
  const leaveConversation = useCallback((id: string) => { void fetch(`/api/messenger/conversations/${encodeURIComponent(id)}/typing`, { method: 'DELETE' }).catch(() => {}); }, []);
  const sendTyping = useCallback((id: string, _userId: string, _username: string) => {
    void _userId; void _username;
    void fetch(`/api/messenger/conversations/${encodeURIComponent(id)}/typing`, { method: 'POST' }).catch(() => {});
  }, []);
  const stopTyping = leaveConversation;
  return useMemo(() => ({ connected, joinConversation, leaveConversation, sendTyping, stopTyping }), [connected, joinConversation, leaveConversation, sendTyping, stopTyping]);
}
