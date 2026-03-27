"use client";

import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface ChartDataPoint {
  date: string;
  reddit: number;
  googleTrends: number;
}

interface TrendChartProps {
  data: ChartDataPoint[];
}

export function TrendChart({ data }: TrendChartProps) {
  const option = {
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: "#1e293b",
      borderColor: "#334155",
      textStyle: { color: "#f1f5f9" },
    },
    legend: {
      data: ["Reddit", "Google Trends"],
      bottom: 0,
      textStyle: { color: "#94a3b8" },
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "15%",
      top: "5%",
      containLabel: true,
    },
    xAxis: {
      type: "category" as const,
      boundaryGap: false,
      data: data.map((d) => {
        const date = new Date(d.date);
        return `${date.getMonth() + 1}/${date.getDate()}`;
      }),
      axisLine: { lineStyle: { color: "#cbd5e1" } },
      axisLabel: { color: "#94a3b8", fontSize: 11 },
    },
    yAxis: {
      type: "value" as const,
      axisLine: { show: false },
      axisLabel: { color: "#94a3b8", fontSize: 11 },
      splitLine: { lineStyle: { color: "#e2e8f0", type: "dashed" as const } },
    },
    series: [
      {
        name: "Reddit",
        type: "line" as const,
        smooth: true,
        symbol: "none",
        data: data.map((d) => d.reddit),
        lineStyle: { width: 2, color: "#f97316" },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(249, 115, 22, 0.15)" },
            { offset: 1, color: "rgba(249, 115, 22, 0.01)" },
          ]),
        },
      },
      {
        name: "Google Trends",
        type: "line" as const,
        smooth: true,
        symbol: "none",
        data: data.map((d) => d.googleTrends),
        lineStyle: { width: 2, color: "#3b82f6" },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(59, 130, 246, 0.15)" },
            { offset: 1, color: "rgba(59, 130, 246, 0.01)" },
          ]),
        },
      },
    ],
  };

  return (
    <Card className="col-span-full lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Trend Volume (Last 30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <ReactEChartsCore echarts={echarts} option={option} style={{ height: "320px" }} />
      </CardContent>
    </Card>
  );
}
