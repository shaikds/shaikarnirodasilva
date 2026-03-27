"use client";

import type { Activity } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity as ActivityIcon, TrendingUp, Users, Mail, CheckCircle, Database } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface RecentActivityProps {
  activities: Activity[];
}

function getActivityIcon(type: Activity["type"]) {
  switch (type) {
    case "TREND_DETECTED":
      return <TrendingUp className="h-4 w-4 text-blue-600" />;
    case "SUPPLIER_FOUND":
      return <Users className="h-4 w-4 text-emerald-600" />;
    case "OUTREACH_SENT":
      return <Mail className="h-4 w-4 text-amber-600" />;
    case "OUTREACH_RESPONDED":
      return <CheckCircle className="h-4 w-4 text-purple-600" />;
    case "SCRAPE_COMPLETED":
      return <Database className="h-4 w-4 text-slate-600" />;
  }
}

function timeAgo(timestamp: string): string {
  const now = new Date("2026-03-27T12:00:00Z");
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
}

export function RecentActivity({ activities }: RecentActivityProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <ActivityIcon className="h-4 w-4 text-blue-600" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-slate-100 dark:bg-slate-800 p-2">
                {getActivityIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug">{activity.message}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {timeAgo(activity.timestamp)} &middot; {formatDate(activity.timestamp)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
