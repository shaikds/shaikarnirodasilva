'use client';
import { useState, useEffect } from 'react';
import { useI18n } from '@/lib/i18n';
import { ISRAEL_LOCATIONS } from '@/lib/israel-locations';

interface LocationPickerProps {
  city: string;
  neighborhood: string;
  onCityChange: (city: string) => void;
  onNeighborhoodChange: (neighborhood: string) => void;
}

export function LocationPicker({ city, neighborhood, onCityChange, onNeighborhoodChange }: LocationPickerProps) {
  const { t } = useI18n();
  const isHe = t.lang === 'he';
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);

  useEffect(() => {
    if (city) {
      const found = ISRAEL_LOCATIONS.find(c => c.name === city || c.name_he === city);
      setNeighborhoods(found?.neighborhoods ?? []);
      onNeighborhoodChange('');
    } else {
      setNeighborhoods([]);
    }
  }, [city]);

  const selectCls = 'mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-harvest-500 bg-white';

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-sm font-medium text-gray-700">
        {t.groups.cityLabel}
        <select className={selectCls} value={city} onChange={e => onCityChange(e.target.value)}>
          <option value="">{t.teams.selectCity}</option>
          {ISRAEL_LOCATIONS.map(c => (
            <option key={c.name} value={isHe ? c.name_he : c.name}>
              {isHe ? c.name_he : c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium text-gray-700">
        {t.teams.neighborhoodLabel}
        <select
          className={selectCls}
          value={neighborhood}
          onChange={e => onNeighborhoodChange(e.target.value)}
          disabled={!city}
        >
          <option value="">{t.teams.selectNeighborhood}</option>
          {neighborhoods.map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
