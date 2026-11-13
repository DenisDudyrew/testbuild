"use client";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface Session {
  user: { id: string; name: string; image?: string | null; role: string };
  expires: string;
}
interface AuthContext {
  data: Session | null;
  status: "loading" | "authenticated" | "unauthenticated";
  update: () => Promise<Session | null>;
}
const Context = createContext<AuthContext | null>(null);
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [data, setData] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const update = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Session unavailable');
      const value = await response.json();
      const session: Session | null = value?.user?.id ? value : null;
      setData(session); setLoaded(true);
      return session;
    } catch { setLoaded(true); return null; }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void update();
    const refresh = () => { void update(); };
    const visible = () => { if (!document.hidden) void update(); };
    window.addEventListener('auth:changed', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('auth:changed', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [update]);
  useEffect(() => { if (loaded && !data && pathname !== '/') router.replace('/'); }, [loaded, data, pathname, router]);
  return <Context.Provider value={{ data, status: !loaded ? 'loading' : data ? 'authenticated' : 'unauthenticated', update }}>{children}</Context.Provider>;
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error('SessionProvider is required');
  return value;
}
export async function signIn(_provider: string, options: { username: string; password: string; redirect?: boolean }) {
  const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: options.username, password: options.password }) });
  const data = await response.json();
  return { ok: response.ok, status: response.status, error: response.ok ? undefined : data.error || 'Не удалось войти', url: response.ok ? '/feed' : null };
}
export async function signOut(options?: { redirect?: boolean }) {
  const response = await fetch('/api/auth/logout', { method: 'POST' });
  if (!response.ok) throw new Error('Не удалось выйти из аккаунта');
  window.dispatchEvent(new Event('auth:changed'));
  if (options?.redirect !== false) window.location.assign('/');
}
