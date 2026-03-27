import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLeads } from '../../hooks/useLeads';
import LeadFilters from './LeadFilters';
import LeadCard from './LeadCard';
import LeadDetail from './LeadDetail';
import OutreachSuggestion from '../Outreach/OutreachSuggestion';
import Spinner from '../common/Spinner';
import styles from './LeadList.module.css';

export default function LeadList() {
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get('search') || '';
  const { leads, loading, error, filters, setFilters, updateLead } = useLeads({ search: initialSearch });
  const [selectedLead, setSelectedLead] = useState(null);
  const [outreachLead, setOutreachLead] = useState(null);

  useEffect(() => {
    const search = searchParams.get('search');
    if (search !== null && search !== filters.search) {
      setFilters((prev) => ({ ...prev, search }));
    }
  }, [searchParams, filters.search, setFilters]);

  const handleStatusChange = async (id, status) => {
    try {
      await updateLead(id, { status });
    } catch {
      /* handled in hook */
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Leads</h1>

      <LeadFilters filters={filters} onChange={setFilters} />

      {loading && <Spinner size="lg" />}

      {error && (
        <div className={styles.error}>Failed to load leads: {error}</div>
      )}

      {!loading && !error && leads.length === 0 && (
        <div className={styles.empty}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <p>No leads found matching your filters.</p>
        </div>
      )}

      {!loading && leads.length > 0 && (
        <div className={styles.grid}>
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onView={(l) => setSelectedLead(l)}
              onStatusChange={handleStatusChange}
              onSuggestOutreach={(l) => setOutreachLead(l)}
            />
          ))}
        </div>
      )}

      <LeadDetail
        lead={selectedLead}
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        onUpdate={updateLead}
      />

      <OutreachSuggestion
        lead={outreachLead}
        isOpen={!!outreachLead}
        onClose={() => setOutreachLead(null)}
      />
    </div>
  );
}
