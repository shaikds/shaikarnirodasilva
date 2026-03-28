import { useState, useEffect } from 'react';
import api from '../../services/api';
import StatCard from './StatCard';
import LeadChart from './LeadChart';
import RecentLeads from './RecentLeads';
import Spinner from '../common/Spinner';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await api.get('/dashboard/stats');
        setStats(data.stats || data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return <Spinner size="lg" />;

  if (error) {
    return (
      <div className={styles.error}>
        <p>Failed to load dashboard: {error}</p>
      </div>
    );
  }

  const totalLeads = stats?.totalLeads ?? 0;
  const newToday = stats?.newToday ?? 0;
  const highScoreLeads = stats?.highScoreLeads ?? 0;
  const activeKeywords = stats?.activeKeywords ?? 0;

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.pageTitle}>Dashboard</h1>

      <div className={styles.statsGrid}>
        <StatCard
          title="Total Leads"
          value={totalLeads}
          color="blue"
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
        <StatCard
          title="New Today"
          value={newToday}
          color="green"
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          }
        />
        <StatCard
          title="High Score Leads"
          value={highScoreLeads}
          color="orange"
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          }
        />
        <StatCard
          title="Active Keywords"
          value={activeKeywords}
          color="purple"
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="9" x2="20" y2="9" />
              <line x1="4" y1="15" x2="20" y2="15" />
              <line x1="10" y1="3" x2="8" y2="21" />
              <line x1="16" y1="3" x2="14" y2="21" />
            </svg>
          }
        />
      </div>

      <div className={styles.chartSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Leads Over Time</h2>
          <span className={styles.sectionSubtitle}>Last 7 days</span>
        </div>
        <LeadChart data={stats?.chartData || []} />
      </div>

      <div className={styles.recentSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recent Leads</h2>
        </div>
        <RecentLeads leads={stats?.recentLeads || []} />
      </div>
    </div>
  );
}
