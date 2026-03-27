import { cn } from "@/lib/utils";

interface SupplierScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
}

function getScoreConfig(score: number) {
  if (score >= 80) return { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200", label: "Excellent" };
  if (score >= 60) return { color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", label: "Good" };
  if (score >= 40) return { color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200", label: "Fair" };
  return { color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", label: "Low" };
}

export function SupplierScoreBadge({ score, size = "md" }: SupplierScoreBadgeProps) {
  const config = getScoreConfig(score);
  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-xs px-2.5 py-1",
    lg: "text-sm px-3 py-1.5",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold",
        config.color,
        sizeClasses[size]
      )}
    >
      <span>{score}</span>
      <span className="opacity-70">/ 100</span>
    </span>
  );
}
