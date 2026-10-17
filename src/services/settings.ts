import { useSyncExternalStore } from 'react';

export type Lang = 'vi' | 'en';
export type Theme = 'system' | 'light' | 'dark';

export interface AppSettings {
  lang: Lang;
  theme: Theme;
  apiKey: string;
  model: string;
  /** Last members used as payer per trip, for quick defaults. */
  lastPayer: Record<string, string>;
}

export const DEFAULT_MODEL = 'gemma-3-27b-it';
const KEY = 'chiatien.settings';

const defaults: AppSettings = { lang: 'vi', theme: 'system', apiKey: '', model: DEFAULT_MODEL, lastPayer: {} };

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
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
