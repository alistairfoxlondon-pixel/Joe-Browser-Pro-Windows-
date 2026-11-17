import React, { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { muiTheme } from './theme';
import { currentTheme, subscribeTheme } from './themeState';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import 'flag-icons/css/flag-icons.min.css';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('The root element is missing from index.html.');

/**
 * The MUI theme follows the same `joe-theme` flag the stylesheet uses. Both parents read the
 * computed value live so a toggle flips them together without a reload.
 */
function ThemedApp(): React.JSX.Element {
  const mode = useSyncExternalStore(subscribeTheme, currentTheme, () => 'dark' as const);

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
