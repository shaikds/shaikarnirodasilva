"use client";

import type { Trend } from "@/lib/mock-data";
import { mockSuppliers } from "@/lib/mock-data";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { SupplierScoreBadge } from "@/components/dashboard/SupplierScoreBadge";
import { Separator } from "@/components/ui/separator";
import { formatNumber, formatPercent, formatDate } from "@/lib/utils";
import { TrendingUp, Calendar, Hash, Users } from "lucide-react";

interface TrendDetailProps {
  trend: Trend | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TrendDetail({ trend, open, onOpenChange }: TrendDetailProps) {
  if (!trend) return null;

  const matchedSuppliers = mockSuppliers
    .filter((s) => s.category === trend.category)
    .sort((a, b) => {
      if (a.source === "LOCAL" && b.source === "ALIBABA") return -1;
      if (a.source === "ALIBABA" && b.source === "LOCAL") return 1;
      return b.reliabilityScore - a.reliabilityScore;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{trend.keyword}</DialogTitle>
          <DialogDescription>Trend details and matched suppliers</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
              <Hash className="h-4 w-4 text-slate-500" />
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Volume</p>
                <p className="font-semibold">{formatNumber(trend.volume)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Growth</p>
                <p className="font-semibold text-emerald-600">{formatPercent(trend.growthRate)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
              <Calendar className="h-4 w-4 text-slate-500" />
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Detected</p>
                <p className="font-semibold text-sm">{formatDate(trend.detectedAt)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
              <Users className="h-4 w-4 text-slate-500" />
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Suppliers</p>
                <p className="font-semibold">{matchedSuppliers.length}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge className={trend.source === "REDDIT" ? "bg-orange-100 text-orange-800" : "bg-blue-100 text-blue-800"}>
              {trend.source === "REDDIT" ? "Reddit" : "Google Trends"}
            </Badge>
            <Badge variant="secondary">{trend.category}</Badge>
          </div>

          <Separator />

          <div>
            <h4 className="font-semibold text-sm mb-3">Matched Suppliers</h4>
            {matchedSuppliers.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No suppliers matched yet.</p>
            ) : (
              <div className="space-y-2">
                {matchedSuppliers.map((supplier) => (
                  <div
                    key={supplier.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800"
                  >
                    <div>
                      <p className="font-medium text-sm">{supplier.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge
                          variant={supplier.source === "LOCAL" ? "success" : "secondary"}
                          className="text-[10px]"
                        >
                          {supplier.source}
                        </Badge>
                        <span className="text-xs text-slate-500">{supplier.country}</span>
                      </div>
                    </div>
                    <SupplierScoreBadge score={supplier.reliabilityScore} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
