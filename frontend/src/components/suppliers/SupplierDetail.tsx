"use client";

import type { Supplier } from "@/lib/mock-data";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ReliabilityMeter } from "./ReliabilityMeter";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/utils";
import { MapPin, Mail, Clock, Package, CheckCircle, ShieldCheck } from "lucide-react";

interface SupplierDetailProps {
  supplier: Supplier | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function outreachStatusBadge(status: string) {
  switch (status) {
    case "RESPONDED":
      return <Badge variant="success">Responded</Badge>;
    case "OPENED":
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Opened</Badge>;
    case "DELIVERED":
      return <Badge variant="secondary">Delivered</Badge>;
    case "SENT":
      return <Badge variant="outline">Sent</Badge>;
    case "FAILED":
      return <Badge variant="destructive">Failed</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function SupplierDetail({ supplier, open, onOpenChange }: SupplierDetailProps) {
  if (!supplier) return null;

  const supplierOutreach: Array<{ id: string; trendKeyword: string; sentAt: string; channel: string; status: string }> = [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {supplier.name}
            {supplier.verified && <CheckCircle className="h-4 w-4 text-blue-500" />}
          </DialogTitle>
          <DialogDescription>Supplier details and outreach history</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="flex items-center gap-2">
            <Badge variant={supplier.source === "LOCAL" ? "success" : "secondary"}>
              {supplier.source}
            </Badge>
            <Badge variant="secondary">{supplier.category}</Badge>
            {supplier.verified && (
              <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                <ShieldCheck className="h-3 w-3 mr-1" />
                Verified
              </Badge>
            )}
          </div>

          <ReliabilityMeter score={supplier.reliabilityScore} />

          <Separator />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
              <MapPin className="h-4 w-4 text-slate-500" />
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Country</p>
                <p className="text-sm font-medium">{supplier.country}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
              <Mail className="h-4 w-4 text-slate-500" />
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Response Rate</p>
                <p className="text-sm font-medium">{supplier.responseRate}%</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
              <Clock className="h-4 w-4 text-slate-500" />
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Lead Time</p>
                <p className="text-sm font-medium">{supplier.avgLeadTime}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
              <Package className="h-4 w-4 text-slate-500" />
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Min Order</p>
                <p className="text-sm font-medium">{supplier.minOrder} units</p>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
            <p className="text-xs text-slate-500 dark:text-slate-400">Contact Email</p>
            <p className="text-sm font-medium">{supplier.contactEmail}</p>
          </div>

          <Separator />

          <div>
            <h4 className="font-semibold text-sm mb-3">Outreach History</h4>
            {supplierOutreach.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No outreach history. Outreach data will appear here once campaigns are triggered.</p>
            ) : (
              <div className="space-y-2">
                {supplierOutreach.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.trendKeyword}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {formatDate(item.sentAt)} via {item.channel}
                      </p>
                    </div>
                    {outreachStatusBadge(item.status)}
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
