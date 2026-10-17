import { useSyncExternalStore } from 'react';

export type Lang = 'vi' | 'en';
export type Theme = 'system' | 'light' | 'dark';

export interface AppSettings {
  lang: Lang;
  theme: Theme;
  apiKey: string;
  model: string;
  /** Gemma 4 thinking mode (slower, more careful). */
  thinking: boolean;
  /** Last members used as payer per trip, for quick defaults. */
  lastPayer: Record<string, string>;
  /** Bumped when stored defaults need migrating. */
  version: number;
}

/** The 26B MoE model answers receipt scans in ~7 s vs ~50 s for 31B, with similar accuracy. */
export const DEFAULT_MODEL = 'gemma-4-26b-a4b-it';
export const SUGGESTED_MODELS = ['gemma-4-26b-a4b-it', 'gemma-4-31b-it'];
const KEY = 'chiatien.settings';

const defaults: AppSettings = { lang: 'vi', theme: 'system', apiKey: '', model: DEFAULT_MODEL, thinking: false, lastPayer: {}, version: 2 };

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s: AppSettings = { ...defaults, version: 1, ...JSON.parse(raw) };
      // Gemma 3 has no native tool calling; move old installs to Gemma 4.
      if (/^gemma-[23]-/.test(s.model)) s.model = DEFAULT_MODEL;
      // v1 defaulted to gemma-4-31b-it, which is ~7× slower than the 26B MoE model.
      if (s.version < 2 && s.model === 'gemma-4-31b-it') s.model = DEFAULT_MODEL;
      s.version = 2;
      return s;
    }
  } catch {
    /* storage unavailable */
  }
  return defaults;
}

let state = load();
const listeners = new Set<() => void>();

export function getSettings() {
  return state;
}

export function setSettings(patch: Partial<AppSettings>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useSettings(): AppSettings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}
