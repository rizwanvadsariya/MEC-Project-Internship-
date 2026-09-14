/**
 * Holds the current session + profile, exposes signIn/signOut, hydrates from
 * secure storage on launch. This is the single source of truth RootNavigator
 * branches on (auth state -> role).
 */
import React, { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { login as apiLogin, fetchMe, type AuthUser } from '../api/auth.api';
import { ApiClientError } from '../api/client';
import { saveSession, loadSession, clearSession } from './secureStorage';

type AuthContextValue = {
  isLoading: boolean;
  user: AuthUser | null;
  accessToken: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // On launch: if a session was saved, confirm it's still valid by fetching
  // the profile; drop it silently if not (expired / deactivated / revoked).
  useEffect(() => {
    (async () => {
      const stored = await loadSession();
      if (stored) {
        try {
          const profile = await fetchMe(stored.accessToken);
          setUser(profile);
          setAccessToken(stored.accessToken);
        } catch {
          await clearSession();
        }
      }
      setIsLoading(false);
    })();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { session, user: authUser } = await apiLogin(email, password);
    const profile = await fetchMe(session.access_token);
    await saveSession({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      userId: authUser.id,
      email: authUser.email,
    });
    setAccessToken(session.access_token);
    setUser(profile);
  };

  const signOut = async () => {
    await clearSession();
    setAccessToken(null);
    setUser(null);
  };

  const value = useMemo(() => ({ isLoading, user, accessToken, signIn, signOut }), [isLoading, user, accessToken]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within an AuthProvider');
  return ctx;
}

export { ApiClientError };
