import { useState, useCallback, useEffect } from 'react';
import api from '../services/api';

export function useKeywords() {
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchKeywords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/keywords');
      setKeywords(Array.isArray(data) ? data : data.keywords || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  const addKeyword = useCallback(async (term, category) => {
    try {
      const data = await api.post('/keywords', { term, category });
      const newKeyword = data.keyword || data;
      setKeywords((prev) => [...prev, newKeyword]);
      return newKeyword;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const updateKeyword = useCallback(async (id, updates) => {
    try {
      const data = await api.put(`/keywords/${id}`, updates);
      const updated = data.keyword || data;
      setKeywords((prev) => prev.map((k) => (k.id === id ? { ...k, ...updated } : k)));
      return updated;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const deleteKeyword = useCallback(async (id) => {
    try {
      await api.delete(`/keywords/${id}`);
      setKeywords((prev) => prev.filter((k) => k.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  return { keywords, loading, error, fetchKeywords, addKeyword, updateKeyword, deleteKeyword };
}
