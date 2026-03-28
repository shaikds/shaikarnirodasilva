"use client";

import { useState, useEffect } from "react";
import api from "@/lib/api";
import { mockOutreach } from "@/lib/mock-data";
import type { OutreachItem } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Mail, Send, Eye, CheckCircle, AlertCircle, MessageSquare } from "lucide-react";

function statusBadge(status: string) {
  switch (status) {
    case "RESPONDED":
      return (
        <Badge variant="success" className="gap-1">
          <CheckCircle className="h-3 w-3" />
          Responded
        </Badge>
      );
    case "OPENED":
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 gap-1">
          <Eye className="h-3 w-3" />
          Opened
        </Badge>
      );
    case "DELIVERED":
      return (
        <Badge variant="secondary" className="gap-1">
          <Send className="h-3 w-3" />
          Delivered
        </Badge>
      );
    case "SENT":
      return (
        <Badge variant="outline" className="gap-1">
          <Send className="h-3 w-3" />
          Sent
        </Badge>
      );
    case "FAILED":
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function channelIcon(channel: string) {
  if (channel === "WHATSAPP") {
    return <MessageSquare className="h-4 w-4 text-emerald-600" />;
  }
  return <Mail className="h-4 w-4 text-blue-600" />;
}

export default function OutreachPage() {
  const [outreach, setOutreach] = useState<OutreachItem[]>(mockOutreach);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOutreach() {
      try {
        const response = await api.get("/outreach");
        const data = response.data.data.map((o: any) => ({
          id: o.id,
          supplierName: o.supplierName || o.supplier?.name || "Unknown",
          trendKeyword: o.trendKeyword || o.trend?.keyword || "Unknown",
          sentAt: o.sentAt || o.createdAt,
          status: o.status,
          channel: o.channel || "EMAIL",
        }));
        setOutreach(data);
      } catch {
        // Fallback to mock data
        setOutreach(mockOutreach);
      } finally {
        setLoading(false);
      }
    }
    fetchOutreach();
  }, []);

  const responded = outreach.filter((o) => o.status === "RESPONDED").length;
  const total = outreach.length;
  const responseRate = total > 0 ? ((responded / total) * 100).toFixed(1) : "0";

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Outreach</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Outreach</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Track and manage supplier outreach campaigns
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 dark:bg-blue-900/30 p-2.5">
              <Send className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{total}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Sent</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/30 p-2.5">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{responded}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Responded</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 p-2.5">
              <Mail className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{responseRate}%</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Response Rate</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Outreach Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-600" />
            Outreach History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="pb-3 text-left font-medium text-slate-500 dark:text-slate-400">Supplier</th>
                  <th className="pb-3 text-left font-medium text-slate-500 dark:text-slate-400">Trend</th>
                  <th className="pb-3 text-left font-medium text-slate-500 dark:text-slate-400">Channel</th>
                  <th className="pb-3 text-left font-medium text-slate-500 dark:text-slate-400">Sent</th>
                  <th className="pb-3 text-left font-medium text-slate-500 dark:text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {outreach.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                  >
                    <td className="py-3 font-medium">{item.supplierName}</td>
                    <td className="py-3 text-slate-600 dark:text-slate-300">{item.trendKeyword}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-1.5">
                        {channelIcon(item.channel)}
                        <span className="text-xs">{item.channel}</span>
                      </div>
                    </td>
                    <td className="py-3 text-slate-500 dark:text-slate-400">{formatDate(item.sentAt)}</td>
                    <td className="py-3">{statusBadge(item.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
