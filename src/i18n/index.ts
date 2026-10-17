import { useCallback } from 'react';
import { useSettings } from '../services/settings';
import { en } from './en';
import { vi, type DictKey } from './vi';

export type { DictKey };
export type TFn = (key: DictKey, params?: Record<string, string | number>) => string;

const dicts = { vi, en } as const;

export function translate(lang: 'vi' | 'en', key: DictKey, params?: Record<string, string | number>): string {
  let s: string = dicts[lang][key] ?? vi[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function useT(): TFn {
  const { lang } = useSettings();
  return useCallback((key, params) => translate(lang, key, params), [lang]);
}

export function useLocale(): string {
  return useSettings().lang === 'en' ? 'en-US' : 'vi-VN';
}
