import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';

export type Theme = 'dark' | 'light' | 'system';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  setThemeFromPreferences: (theme: Theme) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'ui-theme',
  ...props
}: Readonly<ThemeProviderProps>) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );

  useEffect(() => {
    const root = globalThis.document.documentElement;

    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = globalThis.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  // Set theme from user preferences (doesn't mark as user-initiated change)
  const setThemeFromPreferences = useCallback((newTheme: Theme) => {
    localStorage.setItem(storageKey, newTheme);
    setTheme(newTheme);
  }, [storageKey]);

  // Set theme from user interaction (will trigger sync to backend via ThemeSync)
  const handleSetTheme = useCallback((newTheme: Theme) => {
    localStorage.setItem(storageKey, newTheme);
    setTheme(newTheme);
  }, [storageKey]);

  const value = useMemo(() => ({
    theme,
    setTheme: handleSetTheme,
    setThemeFromPreferences,
  }), [theme, handleSetTheme, setThemeFromPreferences]);

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};

interface ThemeSyncProps {
  user: { preferences: Record<string, unknown> } | null;
  updateProfile: (data: { preferences: Record<string, unknown> }) => Promise<void>;
}

const isValidTheme = (value: unknown): value is Theme => {
  return typeof value === 'string' && ['dark', 'light', 'system'].includes(value);
};

/**
 * Syncs theme between ThemeProvider (localStorage) and user profile (backend).
 * - On login: Loads theme from user.preferences.theme
 * - On theme change: Persists to user.preferences.theme
 */
export function ThemeSync({ user, updateProfile }: ThemeSyncProps) {
  const { theme, setThemeFromPreferences } = useTheme();
  const previousThemeRef = useRef<Theme | null>(null);
  const hasInitializedRef = useRef(false);

  // On login, sync theme from user preferences to ThemeProvider
  useEffect(() => {
    if (user && !hasInitializedRef.current) {
      // Safely access theme from preferences with type checking
      const preferences = user.preferences && typeof user.preferences === 'object'
        ? user.preferences
        : {};
      const userTheme = preferences.theme;

      if (isValidTheme(userTheme)) {
        setThemeFromPreferences(userTheme);
        previousThemeRef.current = userTheme;
      } else {
        previousThemeRef.current = theme;
      }
      hasInitializedRef.current = true;
    }
    // Reset when user logs out
    if (!user) {
      hasInitializedRef.current = false;
      previousThemeRef.current = null;
    }
  }, [user, theme, setThemeFromPreferences]);

  // When theme changes (after initialization), sync to backend
  useEffect(() => {
    if (!user || !hasInitializedRef.current) return;
    if (previousThemeRef.current === null) {
      previousThemeRef.current = theme;
      return;
    }
    if (previousThemeRef.current !== theme) {
      previousThemeRef.current = theme;
      // Merge with existing preferences (safely handle if preferences is not an object)
      const existingPreferences = user.preferences && typeof user.preferences === 'object'
        ? user.preferences
        : {};
      const updatedPreferences = {
        ...existingPreferences,
        theme,
      };
      updateProfile({ preferences: updatedPreferences }).catch(() => {
        // Silently fail - theme is still saved in localStorage
      });
    }
  }, [theme, user, updateProfile]);

  return null;
}
