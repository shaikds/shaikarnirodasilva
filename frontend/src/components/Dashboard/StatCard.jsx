import styles from './StatCard.module.css';

export default function StatCard({ title, value, icon, color = 'blue', change }) {
  return (
    <div className={styles.card}>
      <div className={`${styles.iconWrap} ${styles[color]}`}>{icon}</div>
      <div className={styles.content}>
        <div className={styles.value}>{value}</div>
        <div className={styles.title}>{title}</div>
        {change !== undefined && (
          <div className={`${styles.change} ${change >= 0 ? styles.positive : styles.negative}`}>
            {change >= 0 ? '+' : ''}{change}% from yesterday
          </div>
        )}
      </div>
    </div>
  );
}
