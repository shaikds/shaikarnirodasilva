import { useState, useCallback, useEffect } from 'react';
import api from '../services/api';

export function useLeads(initialFilters = {}) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    platform: '',
    status: '',
    minScore: '',
    maxScore: '',
    search: '',
    ...initialFilters,
  });

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== '' && value !== undefined && value !== null) {
          params.append(key, value);
        }
      });
      const query = params.toString();
      const data = await api.get(`/leads${query ? `?${query}` : ''}`);
      setLeads(Array.isArray(data) ? data : data.leads || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const updateLead = useCallback(async (id, updates) => {
    try {
      const data = await api.patch(`/leads/${id}`, updates);
      const updated = data.lead || data;
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...updated } : l)));
      return updated;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const triggerScrape = useCallback(async () => {
    try {
      const result = await api.post('/leads/scrape');
      await fetchLeads();
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [fetchLeads]);

  return { leads, loading, error, filters, setFilters, fetchLeads, updateLead, triggerScrape };
}
