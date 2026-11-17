/* Runs before the renderer and is allowed by the packaged Content Security Policy. */
try {
  const theme = localStorage.getItem('joe-theme');
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
} catch {
  document.documentElement.dataset.theme = 'dark';
}
