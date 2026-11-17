export type ThemeMode = 'dark' | 'light';
let transitionFrame = 0;
const eventName = 'joe:theme-change';

export function currentTheme(): ThemeMode {
  return document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark';
}

/** Apply synchronously, before the next frame, to both the CSS and Material theme. */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  root.classList.add('theme-changing');
  root.style.removeProperty('background');
  root.dataset['theme'] = mode;
  if (transitionFrame) cancelAnimationFrame(transitionFrame);
  transitionFrame = requestAnimationFrame(() => {
    transitionFrame = requestAnimationFrame(() => { root.classList.remove('theme-changing'); transitionFrame = 0; });
  });
  try { localStorage.setItem('joe-theme', mode); } catch { /* Storage may be unavailable. */ }
  window.dispatchEvent(new Event(eventName));
}

export function subscribeTheme(listener: () => void): () => void {
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}
