import styles from './NotificationItem.module.css';

function getIcon(type) {
  switch (type) {
    case 'lead':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
        </svg>
      );
    case 'scrape':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="2">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      );
    case 'alert':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    default:
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple)" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
  }
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationItem({ notification, onMarkRead }) {
  const isRead = notification.is_read;

  return (
    <div className={`${styles.item} ${!isRead ? styles.unread : ''}`}>
      <div className={styles.icon}>
        {getIcon(notification.type)}
      </div>
      <div className={styles.content}>
        <div className={styles.title}>{notification.title || 'Notification'}</div>
        <div className={styles.message}>{notification.message || ''}</div>
        <div className={styles.time}>{timeAgo(notification.created_at)}</div>
      </div>
      {!isRead && (
        <button
          className={styles.readBtn}
          onClick={() => onMarkRead(notification.id)}
          title="Mark as read"
          aria-label="Mark as read"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
