import { useEffect, useState } from 'react';

export const THEME_STORAGE_KEY = 'pbs-help-theme';
export const THEME_OPTIONS = ['system', 'light', 'dark'];

export function readThemePreference() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_OPTIONS.includes(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(preference) {
  const dark = preference === 'dark' || (
    preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.themePreference = preference;
}

export function useTheme() {
  const [preference, setPreference] = useState(readThemePreference);

  useEffect(() => {
    applyTheme(preference);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      if (preference === 'system') applyTheme('system');
    };
    const onStorageChange = (event) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        setPreference(readThemePreference());
      }
    };
    media.addEventListener('change', onSystemChange);
    window.addEventListener('storage', onStorageChange);
    return () => {
      media.removeEventListener('change', onSystemChange);
      window.removeEventListener('storage', onStorageChange);
    };
  }, [preference]);

  const changePreference = (next) => {
    if (!THEME_OPTIONS.includes(next)) return;
    // Update immediately, before the next React render.
    applyTheme(next);
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* private browsing */ }
    setPreference(next);
  };
  return { themePreference: preference, setThemePreference: changePreference };
}
