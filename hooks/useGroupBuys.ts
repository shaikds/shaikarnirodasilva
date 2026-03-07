'use client';
import { useState, useEffect, useCallback } from 'react';
import type { GroupBuy } from '@/types';

interface UseGroupBuysResult {
  groupBuys: GroupBuy[];
  loading: boolean;
  error: string;
  refetch: () => void;
}

export function useGroupBuys(): UseGroupBuysResult {
  const [groupBuys, setGroupBuys] = useState<GroupBuy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/groups');
      if (!res.ok) throw new Error('Failed to fetch group buys');
      const data: GroupBuy[] = await res.json();
      setGroupBuys(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { groupBuys, loading, error, refetch: fetch_ };
}
