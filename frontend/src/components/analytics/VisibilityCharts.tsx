"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { CompetitorResult, TopicResult, VisibilityKpis } from "@/lib/types";

const coverageConfig = {
  cited: { label: "Cited", color: "#0f766e" },
  retrievedOnly: { label: "Found only", color: "#64748b" },
  missing: { label: "Missing", color: "#e7e5e4" },
} satisfies ChartConfig;

const topicConfig = {
  citation: { label: "Citation %", color: "var(--chart-2)" },
  presence: { label: "Presence %", color: "var(--chart-3)" },
} satisfies ChartConfig;

const competitorConfig = {
  citations: { label: "Strength", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function CoverageDonut({ kpis }: { kpis: VisibilityKpis }) {
  const retrievedOnly = Math.max(
    0,
    kpis.retrieved_count - kpis.cited_count
  );
  const data = [
    { name: "cited", value: kpis.cited_count, fill: "var(--color-cited)" },
    {
      name: "retrievedOnly",
      value: retrievedOnly,
      fill: "var(--color-retrievedOnly)",
    },
    { name: "missing", value: kpis.missing_count, fill: "var(--color-missing)" },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-[220px] items-center justify-center text-sm">
        No coverage data
      </div>
    );
  }

  return (
    <ChartContainer config={coverageConfig} className="mx-auto aspect-square max-h-[240px]">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={58}
          outerRadius={90}
          strokeWidth={2}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.fill} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="name" />} />
      </PieChart>
    </ChartContainer>
  );
}

const topicMissingConfig = {
  missing: { label: "Missing %", color: "#a8a29e" },
  presence: { label: "Presence %", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function TopicPerformanceBars({ topics }: { topics: TopicResult[] }) {
  const allZero = topics.every(
    (t) => t.citation_rate === 0 && t.presence_rate === 0
  );

  const data = useMemo(
    () =>
      [...topics]
        .sort((a, b) =>
          allZero
            ? b.missing_count - a.missing_count
            : b.citation_rate - a.citation_rate
        )
        .slice(0, 8)
        .map((t) => {
          const label =
            t.prompt.length > 28 ? `${t.prompt.slice(0, 28)}…` : t.prompt;
          if (allZero) {
            const den = Math.max(1, t.sub_query_count);
            return {
              topic: label,
              missing: Math.round((t.missing_count / den) * 100),
              presence: Math.round(t.presence_rate * 100),
            };
          }
          return {
            topic: label,
            citation: Math.round(t.citation_rate * 100),
            presence: Math.round(t.presence_rate * 100),
          };
        }),
    [topics, allZero]
  );

  if (!data.length) {
    return (
      <div className="text-muted-foreground flex h-[240px] items-center justify-center text-sm">
        No topic data
      </div>
    );
  }

  const config = allZero ? topicMissingConfig : topicConfig;

  return (
    <ChartContainer config={config} className="h-[260px] w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        <YAxis
          dataKey="topic"
          type="category"
          width={120}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {allZero ? (
          <Bar dataKey="missing" fill="var(--color-missing)" radius={4} />
        ) : (
          <>
            <Bar dataKey="citation" fill="var(--color-citation)" radius={4} />
            <Bar dataKey="presence" fill="var(--color-presence)" radius={4} />
          </>
        )}
        <ChartLegend content={<ChartLegendContent />} />
      </BarChart>
    </ChartContainer>
  );
}

export function CompetitorShareBars({
  competitors,
}: {
  competitors: CompetitorResult[];
}) {
  const data = useMemo(
    () =>
      competitors.slice(0, 6).map((c) => ({
        domain: c.domain,
        citations: c.citations,
        share: Math.round(c.share_of_voice * 1000) / 10,
      })),
    [competitors]
  );

  if (!data.length) {
    return (
      <div className="text-muted-foreground flex h-[220px] items-center justify-center text-sm">
        No competitor data
      </div>
    );
  }

  return (
    <ChartContainer config={competitorConfig} className="h-[240px] w-full">
      <BarChart data={data} margin={{ left: 4, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="domain"
          tickLine={false}
          axisLine={false}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={56}
          tick={{ fontSize: 10 }}
        />
        <YAxis allowDecimals={false} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => (
                <div className="flex w-full justify-between gap-4">
                  <span className="text-muted-foreground">Strength</span>
                  <span className="font-mono font-medium">
                    {String(value)}
                    {item?.payload?.share != null
                      ? ` (${item.payload.share}%)`
                      : ""}
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="citations" fill="var(--color-citations)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

/** ECharts gauge for the visibility score (0–100). */
export function VisibilityScoreGauge({ score }: { score: number }) {
  const color =
    score >= 65
      ? "#10b981"
      : score >= 40
        ? "#f59e0b"
        : score >= 18
          ? "#f97316"
          : "#f43f5e";

  const option: EChartsOption = useMemo(
    () => ({
      series: [
        {
          type: "gauge",
          startAngle: 210,
          endAngle: -30,
          min: 0,
          max: 100,
          radius: "95%",
          progress: {
            show: true,
            width: 14,
            itemStyle: { color },
          },
          axisLine: {
            lineStyle: {
              width: 14,
              color: [[1, "#e2e8f0"]],
            },
          },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          pointer: { show: false },
          anchor: { show: false },
          title: { show: false },
          detail: {
            valueAnimation: true,
            fontSize: 42,
            fontWeight: 600,
            offsetCenter: [0, "8%"],
            formatter: "{value}",
            color: "var(--foreground)",
          },
          data: [{ value: score }],
        },
      ],
    }),
    [score, color]
  );

  return (
    <ReactECharts
      option={option}
      style={{ height: 200, width: "100%" }}
      opts={{ renderer: "svg" }}
      notMerge
    />
  );
}

/** ECharts radar comparing your KPIs on a 0–100 normalized scale. */
export function KpiRadar({ kpis }: { kpis: VisibilityKpis }) {
  const rankScore =
    kpis.avg_rank == null
      ? 0
      : Math.max(0, Math.min(100, Math.round(((6 - kpis.avg_rank) / 5) * 100)));

  const option: EChartsOption = useMemo(
    () => ({
      tooltip: {},
      radar: {
        indicator: [
          { name: "Citation", max: 100 },
          { name: "Presence", max: 100 },
          { name: "Share of voice", max: 100 },
          { name: "Rank quality", max: 100 },
        ],
        splitNumber: 4,
        axisName: {
          color: "var(--muted-foreground)",
          fontSize: 11,
        },
        splitLine: { lineStyle: { color: "#e2e8f0" } },
        splitArea: {
          areaStyle: { color: ["transparent", "rgba(148,163,184,0.12)"] },
        },
        axisLine: { lineStyle: { color: "#e2e8f0" } },
      },
      series: [
        {
          type: "radar",
          data: [
            {
              value: [
                Math.round(kpis.citation_rate * 100),
                Math.round(kpis.presence_rate * 100),
                Math.round(kpis.share_of_voice * 100),
                rankScore,
              ],
              name: "Your domain",
              areaStyle: { opacity: 0.25 },
              lineStyle: { width: 2 },
              itemStyle: { color: "var(--chart-2)" },
            },
          ],
        },
      ],
    }),
    [kpis, rankScore]
  );

  return (
    <ReactECharts
      option={option}
      style={{ height: 260, width: "100%" }}
      opts={{ renderer: "svg" }}
      notMerge
    />
  );
}
