/**
 * renderer/lib/theme.ts 로 배치
 *
 * useTheme() 훅 — <html> 의 dark 클래스 상태를 구독하고 토글하는 훅.
 * React 18 의 useSyncExternalStore 기반이라 추가 Context Provider 불필요.
 */

'use client';

import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'sdpe-theme';
const DEFAULT_THEME: Theme = 'light'; // 다크를 기본으로 하려면 'dark' 로 변경

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function getServerSnapshot(): Theme {
  return DEFAULT_THEME;
}

function applyTheme(next: Theme): void {
  const root = document.documentElement;
  if (next === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore quota/privacy errors
  }
}

export function useTheme(): {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggle: () => void;
} {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setTheme = (next: Theme) => applyTheme(next);
  const toggle = () => applyTheme(theme === 'dark' ? 'light' : 'dark');
  return { theme, setTheme, toggle };
}
