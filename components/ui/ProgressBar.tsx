interface ProgressBarProps {
  value: number;      // 0–100
  label?: string;
  labelRight?: string;
  color?: 'green' | 'blue' | 'orange';
}

const COLOR_CLASSES: Record<NonNullable<ProgressBarProps['color']>, string> = {
  green: 'bg-harvest-500',
  blue: 'bg-blue-500',
  orange: 'bg-orange-500',
};

export function ProgressBar({ value, label, labelRight, color = 'green' }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className="w-full">
      {(label || labelRight) && (
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          {label && <span>{label}</span>}
          {labelRight && <span>{labelRight}</span>}
        </div>
      )}
      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className={`${COLOR_CLASSES[color]} h-2 rounded-full transition-all duration-500`}
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
