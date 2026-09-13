import { endpoints } from '@/lib/api/endpoints';
import { tokenStore } from '@/lib/auth/session-events';
import type { SessionDto } from '@/types/api';
import type { Session } from '@/types/domain';
import type { RepositoryClient } from './client';

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  acceptTerms: boolean;
  consents: Array<{ consentId: string; granted: boolean }>;
}

export interface AuthRepository {
  /** Resolves the current session, or throws ApiError(kind: 'unauthorized'). */
  getSession(): Promise<Session>;
  login(input: LoginInput): Promise<Session>;
  register(input: RegisterInput): Promise<Session>;
  logout(): Promise<void>;
  /** Bearer mode silent refresh; resolves false if the refresh cookie is invalid. */
  refresh(): Promise<boolean>;
}

export function createAuthRepository(client: RepositoryClient): AuthRepository {
  const remember = (session: Session) => {
    if (session.accessToken) tokenStore.set(session.accessToken);
    return session;
  };

  return {
    getSession: async () => remember(await client.get<SessionDto>(endpoints.auth.session)),
    login: async (input) => remember(await client.post<SessionDto>(endpoints.auth.login, input)),
    register: async (input) => remember(await client.post<SessionDto>(endpoints.auth.register, input)),
    logout: async () => {
      try {
        await client.post<void>(endpoints.auth.logout);
      } finally {
        tokenStore.set(null);
      }
    },
    refresh: async () => {
      try {
        remember(await client.post<SessionDto>(endpoints.auth.refresh));
        return true;
      } catch {
        tokenStore.set(null);
        return false;
      }
    },
  };
}
