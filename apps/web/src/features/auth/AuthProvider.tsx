import { createContext, useContext, useEffect, useState, useMemo, useCallback, ReactNode } from 'react';
import { api } from '@/lib/api';
import { User, Role } from '@ghostcast/shared';
import { useLlmChatStore } from '@/stores/llm-chat-store';

interface UpdateProfileData {
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string | null;
  preferences?: Record<string, unknown>;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (role: Role) => boolean;
  updateProfile: (data: UpdateProfileData) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

interface AuthProviderProps {
  children: (auth: AuthState) => ReactNode;
}

export function AuthProvider({ children }: Readonly<AuthProviderProps>) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initAuth();

    // When a background API call fails to refresh, clear user state
    // so the UI redirects to login instead of showing a stale GUI.
    api.setAuthFailureHandler(() => {
      setUser(null);
    });
    return () => api.setAuthFailureHandler(null);
  }, []);

  async function initAuth() {
    try {
      // If the URL contains an sso_token, skip the refresh flow.
      // The login page will handle authentication via loginWithToken().
      // Running tryRefresh() here would rotate the session token and
      // invalidate the sso_token before the login page can use it.
      const urlParams = new URLSearchParams(globalThis.location.search);
      if (urlParams.has('sso_token')) {
        return;
      }

      // Fast path: If we have a persisted token, try to use it immediately
      // This avoids the race condition on page refresh
      if (api.hasPersistedToken()) {
        try {
          const response = await api.get<{ data: User }>('/auth/me');
          setUser(response.data);
          setIsLoading(false);
          // No need for background refresh - the 401 handler in api.request()
          // will automatically refresh when the token expires
          return;
        } catch {
          // Token was invalid/expired, fall through to refresh flow
        }
      }

      // Slow path: Try to refresh the token using the httpOnly cookie
      const refreshed = await api.tryRefresh();
      if (!refreshed) {
        setUser(null);
        return;
      }

      // Then fetch the user profile
      const response = await api.get<{ data: User }>('/auth/me');
      setUser(response.data);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.post<{ data: { accessToken: string; user: User } }>(
      '/auth/login',
      { email, password }
    );
    api.setToken(response.data.accessToken);
    setUser(response.data.user);
  }, []);

  const loginWithToken = useCallback(async (token: string) => {
    api.setToken(token);
    const response = await api.get<{ data: User }>('/auth/me');
    setUser(response.data);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      api.setToken(null);
      setUser(null);
      useLlmChatStore.getState().clearMessages();
    }
  }, []);

  const hasRole = useCallback((role: Role): boolean => {
    if (!user) return false;
    const hierarchy: Record<Role, number> = {
      [Role.UNASSIGNED]: -1,
      [Role.MEMBER]: 0,
      [Role.REQUESTER]: 1,
      [Role.SCHEDULER]: 2,
      [Role.MANAGER]: 3,
      [Role.ADMIN]: 4,
    };
    return hierarchy[user.role] >= hierarchy[role];
  }, [user]);

  const updateProfile = useCallback(async (data: UpdateProfileData) => {
    const response = await api.put<{ data: User }>('/auth/profile', data);
    setUser(response.data);
  }, []);

  const refreshUser = useCallback(async () => {
    const response = await api.get<{ data: User }>('/auth/me');
    setUser(response.data);
  }, []);

  const auth = useMemo<AuthState>(() => ({
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    loginWithToken,
    logout,
    hasRole,
    updateProfile,
    refreshUser,
  }), [user, isLoading, login, loginWithToken, logout, hasRole, updateProfile, refreshUser]);

  return (
    <AuthContext.Provider value={auth}>
      {children(auth)}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
