import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSocket } from '@/lib/socket-client';
class FakeEvents {
  static current: FakeEvents;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  callbacks = new Map<string, (event: MessageEvent) => void>();
  close = vi.fn();
  constructor(public url: string) { FakeEvents.current = this; }
  addEventListener(name: string, callback: (event: MessageEvent) => void) { this.callbacks.set(name, callback); }
}
afterEach(() => vi.unstubAllGlobals());
describe('Go realtime client', () => {
  it('receives authenticated events and closes its stream on unmount', async () => {
    vi.stubGlobal('EventSource', FakeEvents);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const onMessageNew = vi.fn(), onReconnect = vi.fn();
    const { result, unmount } = renderHook(() => useSocket('me', { onMessageNew, onReconnect }));
    expect(FakeEvents.current.url).toBe('/api/events');
    act(() => FakeEvents.current.onopen?.());
    await waitFor(() => expect(result.current.connected).toBe(true));
    const message = { id: 'message', conversationId: 'chat', content: 'Привет' };
    act(() => FakeEvents.current.callbacks.get('message:new')?.(new MessageEvent('message:new', { data: JSON.stringify(message) })));
    expect(onMessageNew).toHaveBeenCalledWith(message);
    expect(onReconnect).toHaveBeenCalledOnce();
    unmount();
    expect(FakeEvents.current.close).toHaveBeenCalledOnce();
  });
});
