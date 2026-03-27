import { create } from "zustand";
import type { Trend } from "@/lib/mock-data";
import { mockTrends } from "@/lib/mock-data";

interface TrendFilters {
  source: string;
  status: string;
  search: string;
}

interface TrendStore {
  trends: Trend[];
  selectedTrend: Trend | null;
  filters: TrendFilters;
  loading: boolean;
  page: number;
  pageSize: number;
  fetchTrends: () => void;
  setFilter: (key: keyof TrendFilters, value: string) => void;
  setSelectedTrend: (trend: Trend | null) => void;
  setPage: (page: number) => void;
  filteredTrends: () => Trend[];
}

export const useTrendStore = create<TrendStore>((set, get) => ({
  trends: [],
  selectedTrend: null,
  filters: {
    source: "ALL",
    status: "ALL",
    search: "",
  },
  loading: false,
  page: 1,
  pageSize: 10,

  fetchTrends: () => {
    set({ loading: true });
    // Simulate API call
    setTimeout(() => {
      set({ trends: mockTrends, loading: false });
    }, 500);
  },

  setFilter: (key, value) => {
    set((state) => ({
      filters: { ...state.filters, [key]: value },
      page: 1,
    }));
  },

  setSelectedTrend: (trend) => set({ selectedTrend: trend }),

  setPage: (page) => set({ page }),

  filteredTrends: () => {
    const { trends, filters } = get();
    return trends.filter((t) => {
      if (filters.source !== "ALL" && t.source !== filters.source) return false;
      if (filters.status !== "ALL" && t.status !== filters.status) return false;
      if (filters.search && !t.keyword.toLowerCase().includes(filters.search.toLowerCase()))
        return false;
      return true;
    });
  },
}));
