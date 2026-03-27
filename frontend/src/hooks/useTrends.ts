"use client";

import { useEffect } from "react";
import { useTrendStore } from "@/stores/trendStore";

export function useTrends() {
  const store = useTrendStore();

  useEffect(() => {
    if (store.trends.length === 0 && !store.loading) {
      store.fetchTrends();
    }
  }, [store]);

  const filtered = store.filteredTrends();
  const totalPages = Math.ceil(filtered.length / store.pageSize);
  const paginatedTrends = filtered.slice(
    (store.page - 1) * store.pageSize,
    store.page * store.pageSize
  );

  return {
    trends: paginatedTrends,
    allTrends: filtered,
    loading: store.loading,
    filters: store.filters,
    setFilter: store.setFilter,
    selectedTrend: store.selectedTrend,
    setSelectedTrend: store.setSelectedTrend,
    page: store.page,
    totalPages,
    setPage: store.setPage,
  };
}
