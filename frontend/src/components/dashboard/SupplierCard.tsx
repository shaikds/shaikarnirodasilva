"use client";

import type { Supplier } from "@/lib/mock-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SupplierScoreBadge } from "./SupplierScoreBadge";
import { MapPin, CheckCircle } from "lucide-react";

interface SupplierCardProps {
  supplier: Supplier;
}

export function SupplierCard({ supplier }: SupplierCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">{supplier.name}</h3>
              {supplier.verified && (
                <CheckCircle className="h-4 w-4 text-blue-500" />
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <MapPin className="h-3 w-3" />
              {supplier.country}
            </div>
          </div>
          <Badge
            variant={supplier.source === "LOCAL" ? "success" : "secondary"}
            className="text-[10px]"
          >
            {supplier.source}
          </Badge>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-slate-500 dark:text-slate-400">{supplier.category}</span>
          <SupplierScoreBadge score={supplier.reliabilityScore} size="sm" />
        </div>
      </CardContent>
    </Card>
  );
}
