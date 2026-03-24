const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const TOKEN_STORAGE_KEY = 'ghostcast_access_token';

interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
}

class ApiClient {
  private accessToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  private onAuthFailure: (() => void) | null = null;

  constructor() {
    // Restore token from localStorage on initialization
    this.accessToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  /**
   * Register a callback invoked when token refresh fails,
   * allowing the AuthProvider to clear user state and redirect to login.
   */
  setAuthFailureHandler(handler: (() => void) | null) {
    this.onAuthFailure = handler;
  }

  setToken(token: string | null) {
    this.accessToken = token;
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }

  getToken(): string | null {
    return this.accessToken;
  }

  hasPersistedToken(): boolean {
    return !!this.accessToken;
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { params, ...init } = options;

    let url = `${API_BASE}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...init.headers,
    };

    if (this.accessToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      ...init,
      headers,
      credentials: 'include',
    });

    if (response.status === 401) {
      // Don't try to refresh for auth endpoints - let the error propagate
      const isAuthEndpoint = endpoint.startsWith('/auth/');
      if (!isAuthEndpoint) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          // Retry the request with the new access token
          return this.request(endpoint, options);
        }
        // Refresh failed — notify AuthProvider to clear user state
        this.onAuthFailure?.();
      }
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      if (error.error === 'PASSWORD_RESET_REQUIRED') {
        globalThis.location.href = '/force-reset-password';
        throw new Error('Password reset required');
      }
      throw new Error(error.message || 'Request failed');
    }

    // Handle 204 No Content responses (e.g., DELETE)
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  private async refreshToken(clearOnFailure = true): Promise<boolean> {
    // If a refresh is already in-flight, wait for its result instead of
    // firing a second request (which would race and invalidate the first).
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.executeRefresh(clearOnFailure);

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async executeRefresh(clearOnFailure: boolean): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        if (clearOnFailure) {
          this.setToken(null);
        }
        return false;
      }

      const data = await response.json();
      this.setToken(data.data.accessToken);
      return true;
    } catch {
      if (clearOnFailure) {
        this.setToken(null);
      }
      return false;
    }
  }

  // Public method to attempt token refresh (used on page load)
  async tryRefresh(clearOnFailure = true): Promise<boolean> {
    return this.refreshToken(clearOnFailure);
  }

  get<T>(endpoint: string, params?: Record<string, string>) {
    return this.request<T>(endpoint, { method: 'GET', params });
  }

  post<T>(endpoint: string, body?: unknown) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(endpoint: string, body?: unknown) {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(endpoint: string, body?: unknown) {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(endpoint: string) {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
