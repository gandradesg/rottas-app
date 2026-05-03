// Gerenciamento de tema claro/escuro com persistência
const KEY = 'rottas-theme';

export function getTheme() {
  return localStorage.getItem(KEY)
    || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

export function applyTheme(t) {
  const isDark = t === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content', isDark ? '#0D1320' : '#FFF8F0'
  );
  localStorage.setItem(KEY, t);
}

export function toggleTheme() {
  const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

export function initTheme() {
  applyTheme(getTheme());
}
