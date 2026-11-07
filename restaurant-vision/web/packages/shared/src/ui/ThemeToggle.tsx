import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeStore, type ThemeMode } from '../theme/theme';
import { buttonClass } from './Button';

const NEXT: Record<ThemeMode, ThemeMode> = { light: 'dark', dark: 'system', system: 'light' };
const ICON = { light: Sun, dark: Moon, system: Monitor };

/** Cycles light -> dark -> system. */
export function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation('common');
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const Icon = ICON[mode];
  return (
    <button
      type="button"
      onClick={() => setMode(NEXT[mode])}
      className={buttonClass('ghost', 'sm', className)}
      aria-label={t('theme.toggle', { mode: t(`theme.${mode}`) })}
      title={t('theme.toggle', { mode: t(`theme.${mode}`) })}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
