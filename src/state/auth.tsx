import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { AuthRequestError, authRequest, listenForExpiry, restoreToken, storeToken, type AuthUser } from '@/auth';

const AuthContext = createContext<{
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  verify: (challengeId: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
} | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const restore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (await restoreToken()) setUser(await authRequest<AuthUser>('/auth/me'));
    } catch (e) {
      if (!(e instanceof AuthRequestError && e.status === 401)) {
        setError(e instanceof Error ? e.message : 'Could not restore your session.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = listenForExpiry(() => {
      setUser(null);
      client.clear();
      void storeToken(null).catch(() => {});
    });
    void restore();
    return unsubscribe;
  }, [client, restore]);

  const verify = async (challengeId: string, code: string) => {
    const session = await authRequest<{ accessToken: string; user: AuthUser }>(
      '/auth/verify-code', { challengeId, code }, false,
    );
    await storeToken(session.accessToken);
    client.clear();
    setError(null);
    setUser(session.user);
  };

  const signOut = async () => {
    await authRequest('/auth/logout', {});
    await storeToken(null);
    await client.cancelQueries();
    client.clear();
    setUser(null);
  };

  const completeOnboarding = async () => {
    setUser(await authRequest<AuthUser>('/auth/onboarding-complete', {}));
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, retry: () => void restore(), verify, signOut, completeOnboarding }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
