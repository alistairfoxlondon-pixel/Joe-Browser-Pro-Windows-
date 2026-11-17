import { createTheme } from '@mui/material/styles';

/**
 * The Material theme, aligned to the application tokens in styles.css.
 *
 * One primary colour everywhere - the same cobalt the shell uses - flat surfaces, an 8px rhythm,
 * a smaller radius than Material's default, and the Inter stack. No gradients are
 * introduced here or anywhere else: elevation is drawn with solid surfaces and hairlines.
 */

export const PRIMARY = '#2f6bde';

const shared = {
  shape: { borderRadius: 6 },
  spacing: 8,
  typography: {
    fontFamily: `'Inter', sans-serif`,
    fontSize: 14,
    button: { textTransform: 'none' as const, fontWeight: 600 },
  },
};

export function muiTheme(mode: 'dark' | 'light') {
  const dark = mode === 'dark';
  return createTheme({
    ...shared,
    palette: {
      mode,
      success: { main: PRIMARY },
      warning: { main: PRIMARY },
      error: { main: PRIMARY },
      primary: { main: PRIMARY, light: dark ? '#6f9bef' : '#4f86ee', dark: '#2457b8', contrastText: '#ffffff' },
      background: dark
        ? { default: '#0e1014', paper: '#171a20' }
        : { default: '#f6f7fa', paper: '#ffffff' },
      divider: dark ? '#262c36' : '#e1e6ef',
      text: dark
        ? { primary: '#eef1f6', secondary: '#b9c1ce' }
        : { primary: '#10151d', secondary: '#414d61' },
    },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 6, fontWeight: 600, boxShadow: 'none' },
          sizeLarge: { height: 42 },
          sizeMedium: { height: 36 },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiCard: { styleOverrides: { root: { backgroundImage: 'none', borderRadius: 10 } } },
      MuiDialog: {
        styleOverrides: { paper: { backgroundImage: 'none', borderRadius: 12 } },
      },
      MuiTextField: { defaultProps: { size: 'small' } },
      MuiTableCell: {
        styleOverrides: { root: { paddingTop: 10, paddingBottom: 10 } },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: 6 } } },
    },
  });
}
