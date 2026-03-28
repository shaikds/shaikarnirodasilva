"use client";

import type { Trend } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatPercent } from "@/lib/utils";
import { TrendingUp } from "lucide-react";

interface TrendTableProps {
  trends: Trend[];
}

function sourceBadge(source: string) {
  if (source === "REDDIT") {
    return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">Reddit</Badge>;
  }
  return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Google Trends</Badge>;
}

function statusBadge(status: string) {
  switch (status) {
    case "NEW":
      return <Badge variant="success">New</Badge>;
    case "TRACKING":
      return <Badge variant="secondary">Tracking</Badge>;
    case "MATCHED":
      return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">Matched</Badge>;
    case "ARCHIVED":
      return <Badge variant="outline">Archived</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function TrendTable({ trends }: TrendTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-600" />
          Recent Trends
        </CardTitle>
      </CardHeader>
      <CardContent>
        {trends.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <p className="text-lg font-medium">No data yet</p>
            <p className="text-sm mt-1">Trigger a scrape from the <a href="/dashboard/admin" className="text-blue-600 hover:underline">Admin page</a> to get started.</p>
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="pb-3 text-left font-medium text-slate-500 dark:text-slate-400">Keyword</th>
                <th className="pb-3 text-left font-medium text-slate-500 dark:text-slate-400">Source</th>
                <th className="pb-3 text-right font-medium text-slate-500 dark:text-slate-400">Volume</th>
                <th className="pb-3 text-right font-medium text-slate-500 dark:text-slate-400">Growth</th>
                <th className="pb-3 text-left font-medium text-slate-500 dark:text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {trends.map((trend) => (
                <tr
                  key={trend.id}
                  className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                >
                  <td className="py-3 font-medium">{trend.keyword}</td>
                  <td className="py-3">{sourceBadge(trend.source)}</td>
                  <td className="py-3 text-right tabular-nums">{formatNumber(trend.volume)}</td>
                  <td className="py-3 text-right">
                    <span className={trend.growthRate >= 0 ? "text-emerald-600" : "text-red-500"}>
                      {formatPercent(trend.growthRate)}
                    </span>
                  </td>
                  <td className="py-3">{statusBadge(trend.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </CardContent>
    </Card>
  );
}
