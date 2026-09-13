'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { type ApiError, isApiError } from '@/lib/api/errors';
import { clearDeviceData } from '@/lib/offline/db';
import { queryKeys } from '@/lib/query/keys';
import type { LoginInput, RegisterInput } from '@/lib/repositories/auth';
import type { Session, User, UserRole } from '@/types/domain';
import { sessionEvents } from './session-events';

/**
 * Session state for the UI. Roles here drive what is *shown*; the backend
 * authorises every request independently.
 */
export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'expired';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  /** Set when the session could not be checked (e.g. offline); status stays `anonymous`. */
  sessionError: ApiError | null;
  login: (input: LoginInput) => Promise<Session>;
  register: (input: RegisterInput) => Promise<Session>;
  logout: () => Promise<void>;
  retrySession: () => void;
  hasRole: (role: UserRole) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [expired, setExpired] = useState(false);

  const session = useQuery({
    queryKey: queryKeys.session,
    queryFn: async () => {
      try {
        return await api.auth.getSession();
      } catch (error) {
        if (isApiError(error) && error.kind === 'unauthorized') return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
  });

  const user = session.data?.user ?? null;
  const status: AuthStatus = expired ? 'expired' : session.isPending ? 'loading' : user ? 'authenticated' : 'anonymous';
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(
    () =>
      sessionEvents.onUnauthorized(() => {
        if (statusRef.current !== 'authenticated') return;
        setExpired(true);
        queryClient.setQueryData(queryKeys.session, null);
      }),
    [queryClient],
  );

  const establish = useCallback(
    async (next: Session) => {
      setExpired(false);
      queryClient.setQueryData(queryKeys.session, next);
      await queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
      return next;
    },
    [queryClient],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      sessionError: session.error && isApiError(session.error) ? session.error : null,
      login: async (input) => establish(await api.auth.login(input)),
      register: async (input) => establish(await api.auth.register(input)),
      logout: async () => {
        try {
          await api.auth.logout();
        } finally {
          // Remove private data from memory and from this device.
          queryClient.clear();
          queryClient.setQueryData(queryKeys.session, null);
          await clearDeviceData();
          setExpired(false);
        }
      },
      retrySession: () => void session.refetch(),
      hasRole: (role) => Boolean(user && (user.roles.includes(role) || user.roles.includes('admin'))),
    }),
    [status, user, session, establish, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
