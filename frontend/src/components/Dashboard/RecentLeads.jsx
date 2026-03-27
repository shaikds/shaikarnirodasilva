import { useNavigate } from 'react-router-dom';
import Badge from '../common/Badge';
import styles from './RecentLeads.module.css';

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

export default function RecentLeads({ leads = [] }) {
  const navigate = useNavigate();

  if (leads.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No leads discovered yet. Add keywords and start scraping to find leads.</p>
      </div>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Platform</th>
            <th>Author</th>
            <th>Content</th>
            <th>Score</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {leads.slice(0, 10).map((lead) => (
            <tr
              key={lead.id}
              className={styles.row}
              onClick={() => navigate(`/leads?search=${encodeURIComponent(lead.author || '')}`)}
            >
              <td>
                <Badge variant={getPlatformVariant(lead.platform)} size="sm">
                  {lead.platform || 'N/A'}
                </Badge>
              </td>
              <td className={styles.author}>{lead.author || 'Unknown'}</td>
              <td className={styles.snippet}>
                {(lead.content || lead.snippet || '').substring(0, 100)}
                {(lead.content || lead.snippet || '').length > 100 ? '...' : ''}
              </td>
              <td>
                <Badge variant={getScoreVariant(lead.score || 0)} size="sm">
                  {lead.score || 0}
                </Badge>
              </td>
              <td>
                <span className={styles.status}>{lead.status || 'new'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
