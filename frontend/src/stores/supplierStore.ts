import { create } from "zustand";
import type { Supplier } from "@/lib/mock-data";
import api from "@/lib/api";

interface SupplierFilters {
  source: string;
  category: string;
  search: string;
}

interface SupplierStore {
  suppliers: Supplier[];
  selectedSupplier: Supplier | null;
  filters: SupplierFilters;
  loading: boolean;
  fetchSuppliers: () => Promise<void>;
  setFilter: (key: keyof SupplierFilters, value: string) => void;
  setSelectedSupplier: (supplier: Supplier | null) => void;
  filteredSuppliers: () => Supplier[];
}

export const useSupplierStore = create<SupplierStore>((set, get) => ({
  suppliers: [],
  selectedSupplier: null,
  filters: {
    source: "ALL",
    category: "ALL",
    search: "",
  },
  loading: false,

  fetchSuppliers: async () => {
    set({ loading: true });
    try {
      const response = await api.get("/suppliers");
      const suppliers = response.data.data.map((s: any) => ({
        id: s.id,
        name: s.name,
        source: s.source === "LOCAL" ? "LOCAL" : "ALIBABA",
        reliabilityScore: s.reliabilityScore || 0,
        country: s.country || "Unknown",
        category: s.category || "General",
        contactEmail: s.contactEmail || "",
        responseRate: s.responseTime ? Math.max(0, 100 - s.responseTime * 2) : 50,
        avgLeadTime: s.responseTime ? `${s.responseTime}-${s.responseTime + 5} days` : "N/A",
        minOrder: s.minOrderQty || 0,
        verified: s.verified || false,
      }));
      // Sort: LOCAL first, then ALIBABA
      const sorted = suppliers.sort((a: any, b: any) => {
        if (a.source === "LOCAL" && b.source === "ALIBABA") return -1;
        if (a.source === "ALIBABA" && b.source === "LOCAL") return 1;
        return b.reliabilityScore - a.reliabilityScore;
      });
      set({ suppliers: sorted, loading: false });
    } catch {
      const { mockSuppliers } = await import("@/lib/mock-data");
      const sorted = [...mockSuppliers].sort((a, b) => {
        if (a.source === "LOCAL" && b.source === "ALIBABA") return -1;
        if (a.source === "ALIBABA" && b.source === "LOCAL") return 1;
        return b.reliabilityScore - a.reliabilityScore;
      });
      set({ suppliers: sorted, loading: false });
    }
  },

  setFilter: (key, value) => {
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    }));
  },

  setSelectedSupplier: (supplier) => set({ selectedSupplier: supplier }),

  filteredSuppliers: () => {
    const { suppliers, filters } = get();
    return suppliers.filter((s) => {
      if (filters.source !== "ALL" && s.source !== filters.source) return false;
      if (filters.category !== "ALL" && s.category !== filters.category) return false;
      if (filters.search && !s.name.toLowerCase().includes(filters.search.toLowerCase()))
        return false;
      return true;
    });
  },
}));
