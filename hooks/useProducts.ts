'use client';
import { useState, useEffect, useCallback } from 'react';
import type { Product } from '@/types';

interface UseProductsOptions {
  category?: string;
  search?: string;
}

interface UseProductsResult {
  products: Product[];
  loading: boolean;
  error: string;
  refetch: () => void;
}

export function useProducts({ category, search }: UseProductsOptions = {}): UseProductsResult {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (category && category !== 'all') params.set('category', category);
      if (search) params.set('search', search);
      const url = `/api/products${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch products');
      const data: Product[] = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [category, search]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { products, loading, error, refetch: fetch_ };
}
