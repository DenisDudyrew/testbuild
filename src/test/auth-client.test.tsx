import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const navigation = vi.hoisted(() => ({ replace: vi.fn(), pathname: '/' }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: navigation.replace }), usePathname: () => navigation.pathname }));
import { SessionProvider, useSession, signIn, signOut } from '@/lib/auth-client';
function Probe() { const { data, status, update } = useSession(); return <><span>{status}</span><span>{data?.user.name}</span><button onClick={() => update()}>Refresh</button></>; }
beforeEach(() => { navigation.pathname = '/'; navigation.replace.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('Go session client', () => {
  it('loads the Go session without NextAuth', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { id: 'me', name: 'denis', role: 'user' }, expires: '2099-01-01' }) }));
    render(<SessionProvider><Probe /></SessionProvider>);
    expect(await screen.findByText('denis')).toBeInTheDocument();
    expect(screen.getByText('authenticated')).toBeInTheDocument();
  });
  it('redirects a protected page when the server revoked its session', async () => {
    navigation.pathname = '/feed';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    render(<SessionProvider><Probe /></SessionProvider>);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/'));
  });
  it('uses the Go login endpoint and returns its error', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Неверный пароль' }) });
    vi.stubGlobal('fetch', fetch);
    const result = await signIn('credentials', { username: 'me', password: 'bad', redirect: false });
    expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
    expect(result.error).toBe('Неверный пароль');
  });
  it('refreshes all providers after server-side logout', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetch);
    render(<SessionProvider><Probe /></SessionProvider>);
    await screen.findByText('unauthenticated');
    await act(() => signOut({ redirect: false }));
    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));
  });
});
