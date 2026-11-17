import { useCallback, type ReactNode } from 'react';
import { DarkMode, LightMode } from '@mui/icons-material';

/**
 * One pill, two glyphs, instant switch.
 *
 * The theme flips by writing the document attribute directly - no transition class is armed, so
 * colours change in the same frame, and `localStorage` remembers the choice before the next
 * paint. Closing and reopening the app restores it without a flash.
 */

export function ThemeToggle({
  theme,
  onChange,
}: {
  theme: 'dark' | 'light';
  onChange: (next: 'dark' | 'light') => void;
}): ReactNode {
  const dark = theme === 'dark';

  const toggle = useCallback(() => {
    onChange(dark ? 'light' : 'dark');
  }, [dark, onChange]);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      data-mode={theme}
      className="theme-toggle"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggle}
    >
      <span className="tt-glyph tt-sun" aria-hidden="true"><LightMode sx={{ fontSize: 13 }} /></span>
      <span className="tt-glyph tt-moon" aria-hidden="true"><DarkMode sx={{ fontSize: 13 }} /></span>
      <span className="tt-knob" aria-hidden="true">
        {dark ? <DarkMode sx={{ fontSize: 14 }} /> : <LightMode sx={{ fontSize: 14 }} />}
      </span>
    </button>
  );
}
