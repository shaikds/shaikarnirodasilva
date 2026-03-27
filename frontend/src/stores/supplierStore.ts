import { create } from "zustand";
import type { Supplier } from "@/lib/mock-data";
import { mockSuppliers } from "@/lib/mock-data";

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
  fetchSuppliers: () => void;
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

  fetchSuppliers: () => {
    set({ loading: true });
    setTimeout(() => {
      // Sort: LOCAL first, then ALIBABA
      const sorted = [...mockSuppliers].sort((a, b) => {
        if (a.source === "LOCAL" && b.source === "ALIBABA") return -1;
        if (a.source === "ALIBABA" && b.source === "LOCAL") return 1;
        return b.reliabilityScore - a.reliabilityScore;
      });
      set({ suppliers: sorted, loading: false });
    }, 500);
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
