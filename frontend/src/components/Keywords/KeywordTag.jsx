import styles from './KeywordTag.module.css';

const CATEGORY_COLORS = {
  general: 'blue',
  technology: 'purple',
  business: 'green',
  marketing: 'orange',
  product: 'red',
  default: 'blue',
};

export default function KeywordTag({ keyword, onToggle, onDelete }) {
  const color = CATEGORY_COLORS[keyword.category] || CATEGORY_COLORS.default;
  const isActive = keyword.is_active !== false;

  return (
    <div className={`${styles.tag} ${styles[color]} ${!isActive ? styles.inactive : ''}`}>
      <span className={styles.term}>{keyword.term}</span>
      {keyword.category && (
        <span className={styles.category}>{keyword.category}</span>
      )}
      <div className={styles.actions}>
        <button
          className={styles.toggleBtn}
          onClick={() => onToggle(keyword)}
          title={isActive ? 'Deactivate' : 'Activate'}
          aria-label={isActive ? 'Deactivate keyword' : 'Activate keyword'}
        >
          {isActive ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
            </svg>
          )}
        </button>
        <button
          className={styles.deleteBtn}
          onClick={() => onDelete(keyword)}
          title="Delete keyword"
          aria-label="Delete keyword"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
