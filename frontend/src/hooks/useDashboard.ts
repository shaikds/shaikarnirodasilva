"use client";

import { useState, useEffect } from "react";
import api from "@/lib/api";

export function useDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalTrends: 0,
    activeSuppliers: 0,
    outreachSent: 0,
    responseRate: 0,
    trendsChange: 0,
    suppliersChange: 0,
    outreachChange: 0,
    responseRateChange: 0,
  });
  const [chartData, setChartData] = useState<{ date: string; reddit: number; googleTrends: number }[]>([]);
  const [recentTrends, setRecentTrends] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const [statsRes, trendsRes] = await Promise.all([
          api.get("/dashboard/stats"),
          api.get("/trends?limit=5"),
        ]);

        const s = statsRes.data.data;
        const trendStatusCounts = s.trends?.statusCounts || {};
        const supplierSourceCounts = s.suppliers?.sourceCounts || {};

        const totalTrends = Object.values(trendStatusCounts).reduce((a: number, b: any) => a + Number(b), 0) as number;
        const activeSuppliers = Object.values(supplierSourceCounts).reduce((a: number, b: any) => a + Number(b), 0) as number;

        setStats({
          totalTrends,
          activeSuppliers,
          outreachSent: 0,
          responseRate: 0,
          trendsChange: 0,
          suppliersChange: 0,
          outreachChange: 0,
          responseRateChange: 0,
        });

        if (trendsRes.data.data) {
          setRecentTrends(trendsRes.data.data.map((t: any) => ({
            id: t.id,
            keyword: t.keyword,
            source: t.source,
            volume: t.volume,
            growthRate: t.growthRate,
            status: t.status,
            detectedAt: t.detectedAt,
            category: t.category || "Uncategorized",
            matchedSuppliers: 0,
          })));
        }

        setChartData([]);
        setError(null);
        setLoading(false);
      } catch {
        setStats({
          totalTrends: 0,
          activeSuppliers: 0,
          outreachSent: 0,
          responseRate: 0,
          trendsChange: 0,
          suppliersChange: 0,
          outreachChange: 0,
          responseRateChange: 0,
        });
        setChartData([]);
        setRecentTrends([]);
        setActivities([]);
        setError("Failed to load dashboard data");
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  return { stats, chartData, recentTrends, activities, loading, error };
}
