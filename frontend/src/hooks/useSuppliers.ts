"use client";

import { useEffect } from "react";
import { useSupplierStore } from "@/stores/supplierStore";

export function useSuppliers() {
  const store = useSupplierStore();

  useEffect(() => {
    if (store.suppliers.length === 0 && !store.loading) {
      store.fetchSuppliers();
    }
  }, [store]);

  return {
    suppliers: store.filteredSuppliers(),
    loading: store.loading,
    filters: store.filters,
    setFilter: store.setFilter,
    selectedSupplier: store.selectedSupplier,
    setSelectedSupplier: store.setSelectedSupplier,
  };
}
