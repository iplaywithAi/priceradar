const KEY = 'pr-theme';

function read() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

function write(value) {
  try { localStorage.setItem(KEY, value); } catch { /* storage can be blocked */ }
}

/** Call once before the first render so there is no flash of the wrong theme. */
export function applySavedTheme() {
  const saved = read();
  if (saved) document.documentElement.dataset.theme = saved;
}

/** Respects the system setting until the user picks one. */
export function toggleTheme() {
  const root = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const current = root.dataset.theme || (systemDark ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  write(next);
}
