"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { type LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  change: number;
  icon: LucideIcon;
  iconColor?: string;
}

export function StatsCard({ title, value, change, icon: Icon, iconColor = "text-blue-600" }: StatsCardProps) {
  const isPositive = change >= 0;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
          </div>
          <div className={cn("rounded-lg p-3 bg-slate-100 dark:bg-slate-800", iconColor)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1 text-sm">
          {isPositive ? (
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
          <span className={cn("font-medium", isPositive ? "text-emerald-600" : "text-red-500")}>
            {isPositive ? "+" : ""}
            {change.toFixed(1)}%
          </span>
          <span className="text-slate-500 dark:text-slate-400">from last month</span>
        </div>
      </CardContent>
    </Card>
  );
}
