"use client";

import { useState, useEffect } from "react";
import api from "@/lib/api";
import { dashboardStats, generateChartData, mockTrends, mockActivities } from "@/lib/mock-data";

export function useDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(dashboardStats);
  const [chartData, setChartData] = useState<{ date: string; reddit: number; googleTrends: number }[]>([]);
  const [recentTrends, setRecentTrends] = useState(mockTrends.slice(0, 5));
  const [activities, setActivities] = useState(mockActivities);

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

        setChartData(generateChartData());
        setLoading(false);
      } catch {
        // Fallback to mock data
        setStats(dashboardStats);
        setChartData(generateChartData());
        setRecentTrends(mockTrends.slice(0, 5));
        setActivities(mockActivities);
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  return { stats, chartData, recentTrends, activities, loading };
}
