"use client";

import { useState, useEffect } from "react";
import { dashboardStats, generateChartData, mockTrends, mockActivities } from "@/lib/mock-data";

export function useDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(dashboardStats);
  const [chartData, setChartData] = useState<{ date: string; reddit: number; googleTrends: number }[]>([]);
  const [recentTrends, setRecentTrends] = useState(mockTrends.slice(0, 5));
  const [activities, setActivities] = useState(mockActivities);

  useEffect(() => {
    const timer = setTimeout(() => {
      setStats(dashboardStats);
      setChartData(generateChartData());
      setRecentTrends(mockTrends.slice(0, 5));
      setActivities(mockActivities);
      setLoading(false);
    }, 600);

    return () => clearTimeout(timer);
  }, []);

  return { stats, chartData, recentTrends, activities, loading };
}
