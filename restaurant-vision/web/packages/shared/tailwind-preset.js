// Shared Tailwind preset: colors are CSS variables (see src/styles.css) so light/dark themes
// switch without class juggling. Apps add their own `content` globs, including
// `../../packages/shared/src/**/*.{ts,tsx}` so the UI kit's classes are generated.
const token = (name) => `rgb(var(--rv-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        border: token('border'),
        fg: token('fg'),
        muted: token('muted'),
        primary: token('primary'),
        'primary-fg': token('primary-fg'),
        'primary-soft': token('primary-soft'),
        danger: token('danger'),
        'danger-soft': token('danger-soft'),
        warning: token('warning'),
        'warning-soft': token('warning-soft'),
        success: token('success'),
        'success-soft': token('success-soft'),
        info: token('info'),
        'info-soft': token('info-soft'),
        focus: token('focus'),
        state: {
          'empty-bg': token('state-empty-bg'),
          'empty-fg': token('state-empty-fg'),
          'empty-stroke': token('state-empty-stroke'),
          'seated-bg': token('state-seated-bg'),
          'seated-fg': token('state-seated-fg'),
          'seated-stroke': token('state-seated-stroke'),
          'attended-bg': token('state-attended-bg'),
          'attended-fg': token('state-attended-fg'),
          'attended-stroke': token('state-attended-stroke'),
          'bussing-bg': token('state-bussing-bg'),
          'bussing-fg': token('state-bussing-fg'),
          'bussing-stroke': token('state-bussing-stroke'),
        },
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          '"Noto Sans Hebrew"',
          'Arial',
          '"Helvetica Neue"',
          'sans-serif',
        ],
      },
      borderRadius: {
        xl: '0.875rem',
      },
      minHeight: {
        tap: '44px',
        'tap-lg': '56px',
      },
      minWidth: {
        tap: '44px',
      },
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.08)',
      },
    },
  },
  plugins: [],
};
