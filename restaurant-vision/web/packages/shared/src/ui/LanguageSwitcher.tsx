import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { currentLanguage, setLanguage } from '../i18n';
import { cn } from '../lib/cn';
import { buttonClass } from './Button';

/** Toggles he <-> en. The button names the target language in that language. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation('common');
  const current = currentLanguage();
  const target = current === 'he' ? 'en' : 'he';
  return (
    <button
      type="button"
      onClick={() => void setLanguage(target)}
      className={buttonClass('ghost', 'sm', cn('px-2', className))}
      aria-label={`${t('lang.label')}: ${t(`lang.${target}`)}`}
    >
      <Languages aria-hidden="true" className="h-4 w-4" />
      <span lang={target}>{t(`lang.${target}`)}</span>
    </button>
  );
}
