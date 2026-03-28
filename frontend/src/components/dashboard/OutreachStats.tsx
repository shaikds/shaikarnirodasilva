"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, CheckCircle, Clock, AlertCircle } from "lucide-react";

interface OutreachStatsProps {
  outreach?: Array<{ status: string }>;
}

export function OutreachStats({ outreach = [] }: OutreachStatsProps) {
  const total = outreach.length;
  const responded = outreach.filter((o) => o.status === "RESPONDED").length;
  const pending = outreach.filter((o) => ["SENT", "DELIVERED", "OPENED"].includes(o.status)).length;
  const failed = outreach.filter((o) => o.status === "FAILED").length;

  const stats = [
    { label: "Total Sent", value: total, icon: Mail, color: "text-blue-600" },
    { label: "Responded", value: responded, icon: CheckCircle, color: "text-emerald-600" },
    { label: "Pending", value: pending, icon: Clock, color: "text-amber-600" },
    { label: "Failed", value: failed, icon: AlertCircle, color: "text-red-500" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Mail className="h-4 w-4 text-blue-600" />
          Outreach Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
              <div>
                <p className="text-lg font-bold">{stat.value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
