"use client";

import { useState } from "react";
import type { Trend } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendDetail } from "./TrendDetail";
import { formatNumber, formatPercent, formatDate } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";

interface TrendListProps {
  trends: Trend[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
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

export function TrendList({ trends, page, totalPages, onPageChange }: TrendListProps) {
  const [selectedTrend, setSelectedTrend] = useState<Trend | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  if (trends.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-slate-100 dark:bg-slate-800 p-4 mb-4">
          <Eye className="h-8 w-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold mb-1">No trends found</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
          Try adjusting your filters or check back later for new trends.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="pb-3 text-left font-medium text-slate-500 dark:text-slate-400">Keyword</th>
              <th className="pb-3 text-left font-medium text-slate-500 dark:text-slate-400">Source</th>
              <th className="pb-3 text-right font-medium text-slate-500 dark:text-slate-400">Volume</th>
              <th className="pb-3 text-right font-medium text-slate-500 dark:text-slate-400">Growth</th>
              <th className="pb-3 text-left font-medium text-slate-500 dark:text-slate-400">Status</th>
              <th className="pb-3 text-left font-medium text-slate-500 dark:text-slate-400">Detected</th>
              <th className="pb-3 text-right font-medium text-slate-500 dark:text-slate-400">Suppliers</th>
              <th className="pb-3 text-right font-medium text-slate-500 dark:text-slate-400"></th>
            </tr>
          </thead>
          <tbody>
            {trends.map((trend) => (
              <tr
                key={trend.id}
                className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedTrend(trend);
                  setDetailOpen(true);
                }}
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
                <td className="py-3 text-slate-500 dark:text-slate-400">{formatDate(trend.detectedAt)}</td>
                <td className="py-3 text-right tabular-nums">{trend.matchedSuppliers}</td>
                <td className="py-3 text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Eye className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <TrendDetail trend={selectedTrend} open={detailOpen} onOpenChange={setDetailOpen} />
    </>
  );
}
