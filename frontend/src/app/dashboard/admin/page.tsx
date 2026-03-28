"use client";

import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Play,
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  Search,
  Database,
  Shield,
} from "lucide-react";

interface QueueStatus {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

interface JobHistoryItem {
  id: string;
  name: string;
  status: string;
  finishedOn?: number;
  processedOn?: number;
  timestamp?: number;
  failedReason?: string;
}

type TriggerKey =
  | "full-pipeline"
  | "reddit"
  | "google-trends"
  | "discover-suppliers"
  | "score";

const triggerButtons: {
  key: TriggerKey;
  label: string;
  endpoint: string;
  icon: React.ElementType;
  description: string;
}[] = [
  {
    key: "full-pipeline",
    label: "Run Full Pipeline",
    endpoint: "/jobs/trigger/full-pipeline",
    icon: Zap,
    description: "Scrape, discover, and score",
  },
  {
    key: "reddit",
    label: "Scrape Reddit",
    endpoint: "/jobs/trigger/scrape/reddit",
    icon: Search,
    description: "Scrape Reddit for trends",
  },
  {
    key: "google-trends",
    label: "Scrape Google Trends",
    endpoint: "/jobs/trigger/scrape/google-trends",
    icon: Search,
    description: "Scrape Google Trends data",
  },
  {
    key: "discover-suppliers",
    label: "Discover Suppliers",
    endpoint: "/jobs/trigger/discover-suppliers",
    icon: Database,
    description: "Alibaba + local suppliers",
  },
  {
    key: "score",
    label: "Score Reliability",
    endpoint: "/jobs/trigger/score",
    icon: Shield,
    description: "Run reliability scoring",
  },
];

const queueNames = [
  "trend-scraping",
  "supplier-discovery",
  "email-outreach",
  "reliability-scoring",
];

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "active":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    default:
      return <Clock className="h-4 w-4 text-slate-400" />;
  }
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "completed":
      return "success" as const;
    case "failed":
      return "destructive" as const;
    case "active":
      return "default" as const;
    default:
      return "secondary" as const;
  }
}

function formatTimestamp(ts?: number | string) {
  if (!ts) return "N/A";
  const date = new Date(typeof ts === "string" ? ts : ts);
  return date.toLocaleString();
}

export default function AdminPage() {
  const [triggerLoading, setTriggerLoading] = useState<
    Record<TriggerKey, boolean>
  >({
    "full-pipeline": false,
    reddit: false,
    "google-trends": false,
    "discover-suppliers": false,
    score: false,
  });
  const [triggerResult, setTriggerResult] = useState<
    Record<TriggerKey, { success: boolean; message: string } | null>
  >({
    "full-pipeline": null,
    reddit: null,
    "google-trends": null,
    "discover-suppliers": null,
    score: null,
  });

  const [queueStatuses, setQueueStatuses] = useState<
    Record<string, QueueStatus>
  >({});
  const [queueLoading, setQueueLoading] = useState(false);

  const [jobHistory, setJobHistory] = useState<JobHistoryItem[]>([]);
  const [selectedQueue, setSelectedQueue] = useState(queueNames[0]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchQueueStatus = useCallback(async () => {
    setQueueLoading(true);
    try {
      const response = await api.get("/jobs/status");
      setQueueStatuses(response.data.data || response.data || {});
    } catch {
      // silently fail
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const fetchJobHistory = useCallback(async (queueName: string) => {
    setHistoryLoading(true);
    try {
      const response = await api.get(`/jobs/history/${queueName}`);
      setJobHistory(response.data.data || response.data || []);
    } catch {
      setJobHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueueStatus();
    fetchJobHistory(selectedQueue);

    const interval = setInterval(() => {
      fetchQueueStatus();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchQueueStatus, fetchJobHistory, selectedQueue]);

  async function handleTrigger(
    key: TriggerKey,
    endpoint: string
  ) {
    setTriggerLoading((prev) => ({ ...prev, [key]: true }));
    setTriggerResult((prev) => ({ ...prev, [key]: null }));
    try {
      await api.post(endpoint);
      setTriggerResult((prev) => ({
        ...prev,
        [key]: { success: true, message: "Job triggered successfully" },
      }));
      // Refresh queue status after triggering
      setTimeout(() => fetchQueueStatus(), 1000);
    } catch (err: any) {
      setTriggerResult((prev) => ({
        ...prev,
        [key]: {
          success: false,
          message:
            err?.response?.data?.message || err?.message || "Failed to trigger job",
        },
      }));
    } finally {
      setTriggerLoading((prev) => ({ ...prev, [key]: false }));
      // Clear toast after 5 seconds
      setTimeout(() => {
        setTriggerResult((prev) => ({ ...prev, [key]: null }));
      }, 5000);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage scraping jobs, monitor queues, and view job history
        </p>
      </div>

      {/* Job Trigger Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Play className="h-4 w-4 text-blue-600" />
            Trigger Jobs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {triggerButtons.map((btn) => {
              const Icon = btn.icon;
              const loading = triggerLoading[btn.key];
              const result = triggerResult[btn.key];
              return (
                <div key={btn.key} className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 h-auto py-3"
                    disabled={loading}
                    onClick={() => handleTrigger(btn.key, btn.endpoint)}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                    <div className="text-left">
                      <div className="font-medium">{btn.label}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {btn.description}
                      </div>
                    </div>
                  </Button>
                  {result && (
                    <div
                      className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 ${
                        result.success
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                      }`}
                    >
                      {result.success ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {result.message}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Queue Status Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <RefreshCw
                className={`h-4 w-4 text-blue-600 ${
                  queueLoading ? "animate-spin" : ""
                }`}
              />
              Queue Status
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchQueueStatus}
              disabled={queueLoading}
            >
              <RefreshCw
                className={`h-3 w-3 mr-1 ${queueLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {queueNames.map((queue) => {
              const status = queueStatuses[queue] || {
                waiting: 0,
                active: 0,
                completed: 0,
                failed: 0,
              };
              return (
                <div
                  key={queue}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3"
                >
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 truncate">
                    {queue}
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-slate-400" />
                      <span className="text-slate-500 dark:text-slate-400">
                        Waiting
                      </span>
                      <span className="ml-auto font-semibold">
                        {status.waiting}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 text-blue-500" />
                      <span className="text-slate-500 dark:text-slate-400">
                        Active
                      </span>
                      <span className="ml-auto font-semibold">
                        {status.active}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="h-3 w-3 text-emerald-500" />
                      <span className="text-slate-500 dark:text-slate-400">
                        Done
                      </span>
                      <span className="ml-auto font-semibold">
                        {status.completed}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <XCircle className="h-3 w-3 text-red-500" />
                      <span className="text-slate-500 dark:text-slate-400">
                        Failed
                      </span>
                      <span className="ml-auto font-semibold">
                        {status.failed}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Auto-refreshes every 5 seconds
          </p>
        </CardContent>
      </Card>

      {/* Job History Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              Job History
            </CardTitle>
            <div className="flex items-center gap-2">
              <select
                value={selectedQueue}
                onChange={(e) => {
                  setSelectedQueue(e.target.value);
                  fetchJobHistory(e.target.value);
                }}
                className="text-xs border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
              >
                {queueNames.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchJobHistory(selectedQueue)}
                disabled={historyLoading}
              >
                <RefreshCw
                  className={`h-3 w-3 ${historyLoading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : jobHistory.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
              No jobs found for this queue
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="pb-3 text-left font-medium text-slate-500 dark:text-slate-400">
                      Job
                    </th>
                    <th className="pb-3 text-left font-medium text-slate-500 dark:text-slate-400">
                      Status
                    </th>
                    <th className="pb-3 text-left font-medium text-slate-500 dark:text-slate-400">
                      Timestamp
                    </th>
                    <th className="pb-3 text-left font-medium text-slate-500 dark:text-slate-400">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {jobHistory.map((job, idx) => (
                    <tr
                      key={job.id || idx}
                      className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                    >
                      <td className="py-3 font-medium">
                        <div className="flex items-center gap-2">
                          {statusIcon(job.status)}
                          <span className="truncate max-w-[200px]">
                            {job.name || `Job #${job.id}`}
                          </span>
                        </div>
                      </td>
                      <td className="py-3">
                        <Badge variant={statusBadgeVariant(job.status)}>
                          {job.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-slate-500 dark:text-slate-400 text-xs">
                        {formatTimestamp(
                          job.finishedOn || job.processedOn || job.timestamp
                        )}
                      </td>
                      <td className="py-3 text-xs text-slate-500 dark:text-slate-400 truncate max-w-[250px]">
                        {job.failedReason || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
