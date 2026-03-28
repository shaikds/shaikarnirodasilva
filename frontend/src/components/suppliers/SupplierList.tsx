"use client";

import { useState } from "react";
import type { Supplier } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { SupplierScoreBadge } from "@/components/dashboard/SupplierScoreBadge";
import { SupplierDetail } from "./SupplierDetail";
import { Search, MapPin, CheckCircle, Eye, Users } from "lucide-react";

interface SupplierListProps {
  suppliers: Supplier[];
  filters: { source: string; category: string; search: string };
  onFilterChange: (key: "source" | "category" | "search", value: string) => void;
}

export function SupplierList({ suppliers, filters, onFilterChange }: SupplierListProps) {
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const categories = Array.from(new Set(suppliers.map((s) => s.category)));

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search suppliers..."
            value={filters.search}
            onChange={(e) => onFilterChange("search", e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-full sm:w-44">
          <Select value={filters.source} onValueChange={(v) => onFilterChange("source", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Sources</SelectItem>
              <SelectItem value="LOCAL">Local</SelectItem>
              <SelectItem value="ALIBABA">Alibaba</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-44">
          <Select value={filters.category} onValueChange={(v) => onFilterChange("category", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {suppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-slate-100 dark:bg-slate-800 p-4 mb-4">
            <Users className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold mb-1">No suppliers found</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
            Try adjusting your filters, or trigger a scrape from the <a href="/dashboard/admin" className="text-blue-600 hover:underline">Admin page</a> to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((supplier) => (
            <div
              key={supplier.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => {
                setSelectedSupplier(supplier);
                setDetailOpen(true);
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{supplier.name}</h3>
                    {supplier.verified && (
                      <CheckCircle className="h-4 w-4 text-blue-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-sm text-slate-500 dark:text-slate-400">
                    <MapPin className="h-3.5 w-3.5" />
                    {supplier.country}
                  </div>
                </div>
                <Badge
                  variant={supplier.source === "LOCAL" ? "success" : "secondary"}
                >
                  {supplier.source}
                </Badge>
              </div>

              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-500 dark:text-slate-400">{supplier.category}</span>
                <SupplierScoreBadge score={supplier.reliabilityScore} />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-sm">
                <div className="text-slate-500 dark:text-slate-400">
                  Response rate: <span className="font-medium text-slate-900 dark:text-slate-100">{supplier.responseRate}%</span>
                </div>
                <Button variant="ghost" size="sm" className="h-8">
                  <Eye className="h-4 w-4 mr-1" />
                  View
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SupplierDetail supplier={selectedSupplier} open={detailOpen} onOpenChange={setDetailOpen} />
    </>
  );
}
