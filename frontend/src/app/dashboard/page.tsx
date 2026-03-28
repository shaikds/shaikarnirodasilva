"use client";

import { useDashboard } from "@/hooks/useDashboard";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { TrendTable } from "@/components/dashboard/TrendTable";
import { OutreachStats } from "@/components/dashboard/OutreachStats";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Users, Mail, BarChart3 } from "lucide-react";

export default function DashboardPage() {
  const { stats, chartData, recentTrends, activities, loading } = useDashboard();

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Your trend intelligence overview
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Your trend intelligence overview
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Trends"
          value={stats.totalTrends}
          change={stats.trendsChange}
          icon={TrendingUp}
          iconColor="text-blue-600"
        />
        <StatsCard
          title="Active Suppliers"
          value={stats.activeSuppliers}
          change={stats.suppliersChange}
          icon={Users}
          iconColor="text-emerald-600"
        />
        <StatsCard
          title="Outreach Sent"
          value={stats.outreachSent}
          change={stats.outreachChange}
          icon={Mail}
          iconColor="text-purple-600"
        />
        <StatsCard
          title="Response Rate"
          value={`${stats.responseRate}%`}
          change={stats.responseRateChange}
          icon={BarChart3}
          iconColor="text-amber-600"
        />
      </div>

      {/* Chart */}
      <TrendChart data={chartData} />

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TrendTable trends={recentTrends} />
        </div>
        <div className="space-y-6">
          <OutreachStats outreach={[]} />
          <RecentActivity activities={activities} />
        </div>
      </div>
    </div>
  );
}
