import { create } from "zustand";
import type { Trend } from "@/lib/mock-data";
import api from "@/lib/api";

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
  error: string | null;
  page: number;
  pageSize: number;
  fetchTrends: () => Promise<void>;
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
  error: null,
  page: 1,
  pageSize: 10,

  fetchTrends: async () => {
    set({ loading: true });
    try {
      const response = await api.get("/trends");
      const trends = response.data.data.map((t: any) => ({
        id: t.id,
        keyword: t.keyword,
        source: t.source,
        volume: t.volume,
        growthRate: t.growthRate,
        status: t.status,
        detectedAt: t.detectedAt,
        category: t.category || "Uncategorized",
        matchedSuppliers: t.suppliers?.length || 0,
      }));
      set({ trends, loading: false, error: null });
    } catch {
      set({ trends: [], loading: false, error: "Failed to load trends" });
    }
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
