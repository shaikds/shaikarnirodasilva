/** Restaurant Vision mark (same as the cloud apps), drawn with theme tokens. */
export function Logo({ className = 'h-7 w-7 shrink-0' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <rect width="64" height="64" rx="14" fill="rgb(var(--rv-primary))" />
      <circle cx="32" cy="32" r="15" fill="none" stroke="rgb(var(--rv-primary-fg))" strokeWidth="5" />
      <circle cx="32" cy="32" r="5" fill="rgb(var(--rv-primary-fg))" />
    </svg>
  );
}
