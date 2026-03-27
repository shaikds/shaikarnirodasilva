"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Search } from "lucide-react";

interface TrendFiltersProps {
  filters: {
    source: string;
    status: string;
    search: string;
  };
  onFilterChange: (key: "source" | "status" | "search", value: string) => void;
}

export function TrendFilters({ filters, onFilterChange }: TrendFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search trends..."
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
            <SelectItem value="REDDIT">Reddit</SelectItem>
            <SelectItem value="GOOGLE_TRENDS">Google Trends</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="w-full sm:w-44">
        <Select value={filters.status} onValueChange={(v) => onFilterChange("status", v)}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="NEW">New</SelectItem>
            <SelectItem value="TRACKING">Tracking</SelectItem>
            <SelectItem value="MATCHED">Matched</SelectItem>
            <SelectItem value="ARCHIVED">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
