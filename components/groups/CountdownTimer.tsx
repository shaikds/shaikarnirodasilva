'use client';
import { useState, useEffect } from 'react';
import { useI18n } from '@/lib/i18n';

interface CountdownTimerProps {
  expiresAt: string | null;
  compact?: boolean;
}

function getTimeLeft(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return { days, hours, minutes, total: diff };
}

export function CountdownTimer({ expiresAt, compact }: CountdownTimerProps) {
  const { t } = useI18n();
  const [timeLeft, setTimeLeft] = useState(() => expiresAt ? getTimeLeft(expiresAt) : null);

  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => {
      setTimeLeft(getTimeLeft(expiresAt));
    }, 60_000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!expiresAt || !timeLeft) {
    return (
      <span className="text-xs font-semibold text-red-600">
        {t.teams.expired}
      </span>
    );
  }

  // Urgency color
  const urgency = timeLeft.days <= 1
    ? 'text-red-600 bg-red-50 border-red-200'
    : timeLeft.days <= 3
      ? 'text-amber-600 bg-amber-50 border-amber-200'
      : 'text-gray-600 bg-gray-50 border-gray-200';

  if (compact) {
    return (
      <span className={`text-xs font-semibold ${timeLeft.days <= 1 ? 'text-red-600' : timeLeft.days <= 3 ? 'text-amber-600' : 'text-gray-500'}`}>
        {timeLeft.days}d {timeLeft.hours}h
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium ${urgency}`}>
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>
        {t.teams.expiresIn} {timeLeft.days}{t.teams.days} {timeLeft.hours}{t.teams.hours} {timeLeft.minutes}{t.teams.minutes}
      </span>
    </div>
  );
}
