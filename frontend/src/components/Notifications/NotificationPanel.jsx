import { useNotifications } from '../../context/NotificationContext';
import NotificationItem from './NotificationItem';
import Button from '../common/Button';
import Spinner from '../common/Spinner';
import styles from './NotificationPanel.module.css';

export default function NotificationPanel() {
  const { notifications, unreadCount, loading, markAsRead, markAllRead } = useNotifications();

  return (
    <div className={styles.page}>
      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.pageTitle}>Notifications</h1>
          {unreadCount > 0 && (
            <span className={styles.unreadCount}>{unreadCount} unread</span>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" size="sm" onClick={markAllRead}>
            Mark all read
          </Button>
        )}
      </div>

      <div className={styles.list}>
        {loading && <Spinner />}

        {!loading && notifications.length === 0 && (
          <div className={styles.empty}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <p>No notifications yet.</p>
          </div>
        )}

        {!loading &&
          notifications.map((notif) => (
            <NotificationItem
              key={notif.id}
              notification={notif}
              onMarkRead={markAsRead}
            />
          ))}
      </div>
    </div>
  );
}
