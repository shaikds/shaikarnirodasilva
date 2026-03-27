import styles from './LeadFilters.module.css';

export default function LeadFilters({ filters, onChange }) {
  const handleChange = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className={styles.filters}>
      <div className={styles.searchWrap}>
        <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search leads..."
          value={filters.search || ''}
          onChange={(e) => handleChange('search', e.target.value)}
        />
      </div>

      <select
        className={styles.select}
        value={filters.platform || ''}
        onChange={(e) => handleChange('platform', e.target.value)}
      >
        <option value="">All Platforms</option>
        <option value="reddit">Reddit</option>
        <option value="web">Web</option>
      </select>

      <select
        className={styles.select}
        value={filters.status || ''}
        onChange={(e) => handleChange('status', e.target.value)}
      >
        <option value="">All Statuses</option>
        <option value="new">New</option>
        <option value="contacted">Contacted</option>
        <option value="qualified">Qualified</option>
        <option value="closed">Closed</option>
      </select>

      <div className={styles.scoreRange}>
        <input
          type="number"
          className={styles.scoreInput}
          placeholder="Min"
          min="0"
          max="100"
          value={filters.minScore || ''}
          onChange={(e) => handleChange('minScore', e.target.value)}
        />
        <span className={styles.scoreDash}>-</span>
        <input
          type="number"
          className={styles.scoreInput}
          placeholder="Max"
          min="0"
          max="100"
          value={filters.maxScore || ''}
          onChange={(e) => handleChange('maxScore', e.target.value)}
        />
      </div>
    </div>
  );
}
