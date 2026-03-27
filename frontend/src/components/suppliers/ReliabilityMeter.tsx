"use client";

import { cn } from "@/lib/utils";

interface ReliabilityMeterProps {
  score: number;
}

function getScoreConfig(score: number) {
  if (score >= 80) return { color: "bg-emerald-500", trackColor: "bg-emerald-100 dark:bg-emerald-900", label: "Excellent", textColor: "text-emerald-700 dark:text-emerald-400" };
  if (score >= 60) return { color: "bg-amber-500", trackColor: "bg-amber-100 dark:bg-amber-900", label: "Good", textColor: "text-amber-700 dark:text-amber-400" };
  if (score >= 40) return { color: "bg-orange-500", trackColor: "bg-orange-100 dark:bg-orange-900", label: "Fair", textColor: "text-orange-700 dark:text-orange-400" };
  return { color: "bg-red-500", trackColor: "bg-red-100 dark:bg-red-900", label: "Low", textColor: "text-red-700 dark:text-red-400" };
}

export function ReliabilityMeter({ score }: ReliabilityMeterProps) {
  const config = getScoreConfig(score);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Reliability Score</span>
        <div className="flex items-center gap-2">
          <span className={cn("text-2xl font-bold", config.textColor)}>{score}</span>
          <span className="text-sm text-slate-500 dark:text-slate-400">/ 100</span>
        </div>
      </div>
      <div className={cn("h-3 rounded-full overflow-hidden", config.trackColor)}>
        <div
          className={cn("h-full rounded-full transition-all duration-500", config.color)}
          style={{ width: `${score}%` }}
        />
      </div>
      <p className={cn("text-sm font-medium", config.textColor)}>{config.label}</p>
    </div>
  );
}
