"use client";

import { useTrends } from "@/hooks/useTrends";
import { TrendFilters } from "@/components/trends/TrendFilters";
import { TrendList } from "@/components/trends/TrendList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";

export default function TrendsPage() {
  const { trends, loading, filters, setFilter, page, totalPages, setPage } = useTrends();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trends</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Monitor and track emerging product trends
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              All Trends
            </CardTitle>
          </div>
          <TrendFilters filters={filters} onFilterChange={setFilter} />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <TrendList
              trends={trends}
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
