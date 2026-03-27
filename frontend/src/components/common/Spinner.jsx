import styles from './Spinner.module.css';

export default function Spinner({ size = 'md', className = '' }) {
  return (
    <div className={`${styles.wrapper} ${className}`}>
      <div className={`${styles.spinner} ${styles[size]}`} />
    </div>
  );
}
