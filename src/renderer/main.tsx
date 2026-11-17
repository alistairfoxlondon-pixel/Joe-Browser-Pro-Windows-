import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { muiTheme } from './theme';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import 'flag-icons/css/flag-icons.min.css';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('The root element is missing from index.html.');

/**
 * The MUI theme follows the same `joe-theme` flag the stylesheet uses. Both parents read the
 * computed value live so a toggle flips them together without a reload.
 */
function ThemedApp(): React.JSX.Element {
  const [mode, setMode] = useState<'dark' | 'light'>(() =>
    document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark',
  );

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      const next = root.dataset['theme'] === 'light' ? 'light' : 'dark';
      setMode((current) => (current === next ? current : next));
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return (
    <ThemeProvider theme={muiTheme(mode)}>
      <CssBaseline />
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ThemeProvider>
  );
}

createRoot(container).render(
  <React.StrictMode>
    <ThemedApp />
  </React.StrictMode>,
);
