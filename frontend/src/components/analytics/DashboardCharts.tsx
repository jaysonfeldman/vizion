"use client";

import { useMemo } from "react";
import { Bar, BarChart, Cell, Pie, PieChart } from "recharts";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { VisibilityKpis } from "@/lib/types";

const outcomeConfig = {
  cited: { label: "Cited", color: "#ea580c" },
  found: { label: "Found", color: "#a8a29e" },
  missing: { label: "Missing", color: "#e7e5e4" },
} satisfies ChartConfig;

/** Tiny Recharts donut for cited / found / missing — sits in the stats area. */
export function OutcomeMiniDonut({ kpis }: { kpis: VisibilityKpis }) {
  const foundOnly = Math.max(0, kpis.retrieved_count - kpis.cited_count);
  const data = [
    { name: "cited", value: kpis.cited_count, fill: "var(--color-cited)" },
    { name: "found", value: foundOnly, fill: "var(--color-found)" },
    { name: "missing", value: kpis.missing_count, fill: "var(--color-missing)" },
  ].filter((d) => d.value > 0);

  if (!data.length) {
    return (
      <div className="text-muted-foreground flex h-[72px] items-center justify-center text-xs">
        No data
      </div>
    );
  }

  return (
    <ChartContainer config={outcomeConfig} className="mx-auto h-[72px] w-[72px]">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={18}
          outerRadius={32}
          strokeWidth={1}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.fill} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

/** Recharts bar: visibility % per prompt (compact). */
export function PromptVisibilityBars({
  items,
}: {
  items: { label: string; value: number }[];
}) {
  const data = items.slice(0, 6).map((i) => ({
    name: i.label.length > 22 ? `${i.label.slice(0, 22)}…` : i.label,
    value: Math.round(i.value * 100),
  }));

  const config = {
    value: { label: "Visibility", color: "#ea580c" },
  } satisfies ChartConfig;

  if (!data.length) return null;

  return (
    <ChartContainer config={config} className="h-[120px] w-full">
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="value" fill="var(--color-value)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

/** Small ECharts gauge for overall score on selected prompts. */
export function ScoreMiniGauge({ score }: { score: number }) {
  const color =
    score >= 65 ? "#10b981" : score >= 40 ? "#f59e0b" : score >= 18 ? "#f97316" : "#f43f5e";

  const option: EChartsOption = useMemo(
    () => ({
      series: [
        {
          type: "gauge",
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: 100,
          radius: "100%",
          progress: { show: true, width: 8, itemStyle: { color } },
          axisLine: { lineStyle: { width: 8, color: [[1, "#e7e5e4"]] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          pointer: { show: false },
          anchor: { show: false },
          title: { show: false },
          detail: {
            valueAnimation: true,
            fontSize: 22,
            fontWeight: 600,
            offsetCenter: [0, "12%"],
            formatter: "{value}",
            color: "#171717",
          },
          data: [{ value: Math.round(score) }],
        },
      ],
    }),
    [score, color]
  );

  return (
    <ReactECharts
      option={option}
      style={{ height: 88, width: 88 }}
      opts={{ renderer: "svg" }}
      notMerge
    />
  );
}
