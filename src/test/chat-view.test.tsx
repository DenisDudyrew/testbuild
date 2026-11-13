import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
const state = vi.hoisted(() => ({ handlers: {} as { onMessageNew?: (message: unknown) => void } }));
vi.mock('@/lib/auth-client', () => ({ useSession: () => ({ data: { user: { id: 'me', name: 'me' } } }) }));
vi.mock('@/lib/socket-client', () => {
  const socket = { connected: true, joinConversation: vi.fn(), leaveConversation: vi.fn(), stopTyping: vi.fn(), sendTyping: vi.fn() };
  return { useSocket: (_id: unknown, handlers: typeof state.handlers) => { state.handlers = handlers; return socket; } };
});
vi.mock('@/components/ToastProvider', () => ({ useToast: () => ({ showAlert: vi.fn() }) }));
vi.mock('@/components/Avatar', () => ({ default: () => null }));
vi.mock('@/components/messenger/MessageBubble', () => ({ default: ({ message }: { message: { content: string } }) => <div>{message.content}</div> }));
import ChatView from '@/components/messenger/ChatView';
const conversation = { id: 'chat', type: 'direct', name: null, participants: [{ id: 'me', username: 'me', avatar: null }] };
const initial = { id: 'old', content: 'old message', conversationId: 'chat', createdAt: '2026-01-01T00:00:00.000Z', senderId: 'friend', sender: { id: 'friend', username: 'friend', avatar: null } };
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({ ok: true, json: async () => ({ messages: [initial], nextCursor: null, pinnedMessages: [] }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Chat reconciliation', () => {
  it('loads after StrictMode cleanup and appends incoming messages only once', async () => {
    render(<StrictMode><ChatView conversation={conversation} /></StrictMode>);
    expect(await screen.findByText('old message')).toBeInTheDocument();
    const incoming = { ...initial, id: 'new', content: 'new message', createdAt: '2026-01-01T00:00:01.000Z' };
    act(() => { state.handlers.onMessageNew!(incoming); state.handlers.onMessageNew!(incoming); });
    expect(screen.getAllByText('new message')).toHaveLength(1);
  });
  it('does not append events from a different chat', async () => {
    render(<ChatView conversation={conversation} />);
    await screen.findByText('old message');
    act(() => { state.handlers.onMessageNew!({ ...initial, id: 'other', conversationId: 'private', content: 'wrong chat' }); });
    expect(screen.queryByText('wrong chat')).not.toBeInTheDocument();
  });
});
