import { useEffect, useState } from 'preact/hooks';

export type ColorSchemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'openmermaid:color-scheme';

function isColorSchemePreference(value: string | null): value is ColorSchemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function useColorScheme() {
  const [preference, setPreferenceState] = useState<ColorSchemePreference>('system');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isColorSchemePreference(stored)) setPreferenceState(stored);
    } catch {
      // A blocked localStorage should never block the editor.
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') root.removeAttribute('data-theme');
    else root.dataset.theme = preference;

    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Theme persistence is optional.
    }
  }, [preference]);

  return {
    preference,
    setPreference: setPreferenceState,
  } as const;
}
