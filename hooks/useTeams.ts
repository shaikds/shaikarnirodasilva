'use client';
import { useState, useEffect, useCallback } from 'react';
import type { BuyingTeam } from '@/types';

interface UseTeamsResult {
  teams: BuyingTeam[];
  loading: boolean;
  error: string;
  refetch: () => void;
}

export function useTeams(city?: string): UseTeamsResult {
  const [teams, setTeams] = useState<BuyingTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ list: 'true' });
      if (city) params.set('city', city);
      const res = await fetch(`/api/teams?${params}`);
      if (!res.ok) throw new Error('Failed to fetch teams');
      const data: BuyingTeam[] = await res.json();
      setTeams(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { teams, loading, error, refetch: fetch_ };
}
