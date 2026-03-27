"use client";

import { useSuppliers } from "@/hooks/useSuppliers";
import { SupplierList } from "@/components/suppliers/SupplierList";
import { Skeleton } from "@/components/ui/skeleton";

export default function SuppliersPage() {
  const { suppliers, loading, filters, setFilter } = useSuppliers();

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
            Local First
          </span>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Browse and manage suppliers, sorted by reliability with local sources prioritized
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : (
        <SupplierList
          suppliers={suppliers}
          filters={filters}
          onFilterChange={setFilter}
        />
      )}
    </div>
  );
}
