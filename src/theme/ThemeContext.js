import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { avatarColors, elevation, layout, palette, radius, spacing, touch, typography } from './tokens';

const STORAGE_KEY = '@tocah_theme_mode';
const ThemeContext = createContext(null);

/** mode: 'system' | 'light' | 'dark' (o valor antigo 'dark'/'light' salvo continua valendo). */
export function ThemeProvider({ children }) {
  const system = useColorScheme();
  const [mode, setMode] = useState('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'dark' || saved === 'light' || saved === 'system') setMode(saved);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const isDark = mode === 'system' ? system === 'dark' : mode === 'dark';

  const setThemeMode = useCallback(async (next) => {
    setMode(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, next);
    } catch {
      // sem persistência: segue só na sessão
    }
  }, []);

  const toggleTheme = useCallback(() => setThemeMode(isDark ? 'light' : 'dark'), [isDark, setThemeMode]);

  const value = useMemo(() => {
    const colors = isDark ? palette.dark : palette.light;
    const avatars = isDark ? avatarColors.dark : avatarColors.light;
    return {
      ready,
      mode,
      isDark,
      colors,
      avatars,
      spacing,
      radius,
      typography,
      touch,
      layout,
      shadow: (level) => elevation(level, colors),
      toggleTheme,
      setThemeMode,
    };
  }, [isDark, mode, ready, toggleTheme, setThemeMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme precisa estar dentro do ThemeProvider');
  return ctx;
}

/** Compatibilidade com o nome antigo. */
export const useThemeMode = useTheme;
