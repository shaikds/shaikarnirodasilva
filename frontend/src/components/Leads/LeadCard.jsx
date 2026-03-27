import Badge from '../common/Badge';
import Button from '../common/Button';
import styles from './LeadCard.module.css';

function getScoreVariant(score) {
  if (score >= 70) return 'green';
  if (score >= 40) return 'orange';
  return 'red';
}

function getPlatformVariant(platform) {
  if (!platform) return 'default';
  const p = platform.toLowerCase();
  if (p === 'reddit') return 'orange';
  if (p === 'web') return 'blue';
  return 'default';
}

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'closed'];

export default function LeadCard({ lead, onView, onStatusChange, onSuggestOutreach }) {
  const content = lead.content || lead.snippet || '';
  const keywords = lead.matched_keywords || lead.keywords || [];

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <Badge variant={getPlatformVariant(lead.platform)} size="sm">
          {lead.platform || 'N/A'}
        </Badge>
        <Badge variant={getScoreVariant(lead.score || 0)} size="md">
          {lead.score || 0}
        </Badge>
      </div>

      <div className={styles.author}>
        {lead.url ? (
          <a href={lead.url} target="_blank" rel="noopener noreferrer" className={styles.authorLink}>
            {lead.author || 'Unknown'}
          </a>
        ) : (
          <span>{lead.author || 'Unknown'}</span>
        )}
      </div>

      <p className={styles.snippet}>
        {content.substring(0, 150)}
        {content.length > 150 ? '...' : ''}
      </p>

      {keywords.length > 0 && (
        <div className={styles.keywords}>
          {keywords.map((kw, i) => (
            <span key={i} className={styles.keyword}>
              {typeof kw === 'string' ? kw : kw.term || kw}
            </span>
          ))}
        </div>
      )}

      <div className={styles.bottom}>
        <select
          className={styles.statusSelect}
          value={lead.status || 'new'}
          onChange={(e) => onStatusChange(lead.id, e.target.value)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <div className={styles.actions}>
          <Button size="sm" variant="secondary" onClick={() => onView(lead)}>
            View
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onSuggestOutreach(lead)}>
            Outreach
          </Button>
        </div>
      </div>
    </div>
  );
}
