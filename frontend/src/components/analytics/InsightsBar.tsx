"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Info, Loader2 } from "lucide-react";
import type { TopicResult, VisibilityKpis } from "@/lib/types";
import { computeLeaders } from "@/lib/leaders";
import { faviconUrl } from "@/components/analytics/MentionsStack";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function formatPct(ratio: number): string {
  if (!Number.isFinite(ratio)) return "-";
  return `${Math.round(ratio * 100)}%`;
}

function rateTone(ratio: number): "good" | "neutral" {
  // Near-zero reads muted; anything meaningful is positive green.
  if (!Number.isFinite(ratio) || ratio < 0.05) return "neutral";
  return "good";
}

function toneClass(tone: "good" | "neutral") {
  return cn(
    tone === "good" && "text-emerald-600",
    tone === "neutral" && "text-neutral-400"
  );
}

function MetricInfo({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="rounded p-0.5 text-neutral-300 transition hover:text-neutral-500"
          aria-label="About this metric"
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="max-w-[260px] border-0 bg-neutral-900 px-3 py-2 text-left text-[11px] leading-snug text-white shadow-lg"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function StatBlock({
  label,
  info,
  last = false,
  className,
  children,
}: {
  label: string;
  info: string;
  last?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[11rem] flex-col bg-transparent px-5 py-4 sm:min-h-[12rem] sm:px-6 sm:py-5",
        !last && "border-b border-black/5 sm:border-b-0 sm:border-r",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">{label}</p>
        <MetricInfo text={info} />
      </div>
      <div className="mt-2.5 flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

const BAR_COLORS = [
  { top: "rgba(167, 243, 208, 0.95)", bottom: "rgba(167, 243, 208, 0.10)" },
  { top: "rgba(186, 230, 253, 0.95)", bottom: "rgba(186, 230, 253, 0.10)" },
  { top: "rgba(229, 231, 235, 0.95)", bottom: "rgba(229, 231, 235, 0.10)" },
  { top: "rgba(254, 215, 170, 0.95)", bottom: "rgba(254, 215, 170, 0.10)" },
  { top: "rgba(221, 214, 254, 0.95)", bottom: "rgba(221, 214, 254, 0.10)" },
  { top: "rgba(254, 202, 202, 0.95)", bottom: "rgba(254, 202, 202, 0.10)" },
  { top: "rgba(187, 247, 208, 0.95)", bottom: "rgba(187, 247, 208, 0.10)" },
];

type CompBar = {
  domain: string;
  pct: number;
  hits: number;
  isYou?: boolean;
};

function buildCompetitorBars(
  topics: TopicResult[],
  target: string,
  cited: number,
  total: number
): CompBar[] {
  const sample = Math.max(1, total);
  const leaders = computeLeaders(topics, target, 10);

  const competitors = [...leaders]
    .sort((a, b) => b.appearances - a.appearances)
    .slice(0, 7)
    .map((l) => ({
      domain: l.domain,
      hits: l.appearances,
      pct: Math.min(100, Math.round((l.appearances / sample) * 1000) / 10),
      isYou: false as const,
    }));

  const you: CompBar = {
    domain: target,
    hits: cited,
    pct: Math.min(100, Math.round((cited / sample) * 1000) / 10),
    isYou: true,
  };

  return [you, ...competitors]
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 8);
}

function MiniCompetitorChart({
  bars,
  total,
  loading,
}: {
  bars: CompBar[];
  total: number;
  loading?: boolean;
}) {
  const displayBars = bars.length
    ? bars
    : loading
      ? [{ domain: "you", pct: 0, hits: 0, isYou: true }]
      : [];

  const maxPct = Math.max(...displayBars.map((b) => b.pct), 1);
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    if (loading) {
      setGrown(false);
      return;
    }
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, [loading, bars]);

  if (!displayBars.length) {
    return (
      <p className="flex flex-1 items-center text-sm text-neutral-400">-</p>
    );
  }

  return (
    <div className="relative mt-1 h-[9.5rem] w-full sm:h-[10.5rem]">
      <div className="absolute inset-x-0 bottom-5 top-0 flex items-end gap-2 sm:gap-2.5">
        {displayBars.map((b, i) => {
          const targetH = Math.max(18, Math.min(100, (b.pct / maxPct) * 100));
          const h = loading || !grown ? 0 : targetH;
          const colors = BAR_COLORS[i % BAR_COLORS.length];
          const youColors = {
            top: "rgba(110, 231, 183, 0.95)",
            bottom: "rgba(110, 231, 183, 0.10)",
          };
          const fill = b.isYou ? youColors : colors;

          return (
            <div
              key={b.domain}
              className="relative flex h-full flex-1 flex-col items-center justify-end"
              title={
                loading
                  ? "Measuring…"
                  : `${b.domain}: named in ${b.hits} of ${total} searches (${b.pct}% visibility)`
              }
            >
              <div
                className="flex w-full flex-col items-center transition-[height] duration-700 ease-out"
                style={{ height: `${h}%` }}
              >
                {!loading && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="mb-1.5 flex size-5 shrink-0 items-center justify-center"
                        aria-label={b.domain}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={faviconUrl(b.domain)}
                          alt=""
                          className="size-4"
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      sideOffset={4}
                      className="border-0 bg-neutral-900 px-2 py-1 text-[11px] text-white"
                    >
                      {b.domain}
                    </TooltipContent>
                  </Tooltip>
                )}
                <div
                  className="min-h-0 w-[50%] max-w-[1.5rem] flex-1 rounded-t-[4px] transition-opacity duration-500"
                  style={{
                    background: `linear-gradient(to bottom, ${fill.top}, ${fill.bottom})`,
                    opacity: loading ? 0.35 : 1,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex gap-2 sm:gap-2.5">
        {displayBars.map((b) => (
          <span
            key={`pct-${b.domain}`}
            className="flex-1 text-center text-[9px] tabular-nums text-neutral-400 sm:text-[10px]"
          >
            {loading ? "–" : `${Math.round(b.pct)}%`}
          </span>
        ))}
      </div>
    </div>
  );
}

const VISIBILITY_INFO =
  "How often AI names your brand. Count the searches that mention you, divide by all searches, then multiply by 100.";

const COMPETITORS_INFO =
  "Compares how often each brand is named in these AI searches. Same idea as Visibility, shown side by side. Bar height is scaled to the leader so small gaps are easier to see.";

export function InsightsBar({
  topics,
  target,
  kpis,
  loading = false,
}: {
  topics: TopicResult[];
  target: string;
  kpis?: VisibilityKpis;
  loading?: boolean;
}) {
  const { cited, total, visibility } = useMemo(() => {
    let c = 0;
    let t = 0;
    for (const topic of topics) {
      const n = topic.sub_queries?.length || topic.sub_query_count || 0;
      t += n;
      c += topic.cited_count || 0;
    }
    const citedN = kpis?.cited_count ?? c;
    const totalN = kpis?.sample_size ?? t;
    return {
      cited: citedN,
      total: totalN,
      visibility: totalN ? citedN / totalN : 0,
    };
  }, [topics, kpis]);

  const bars = useMemo(
    () => (loading ? [] : buildCompetitorBars(topics, target, cited, total)),
    [topics, target, cited, total, loading]
  );

  const vTone = rateTone(visibility);

  return (
    <div className="grid border-b border-black/5 bg-transparent sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.7fr)]">
      <StatBlock label="Visibility" info={VISIBILITY_INFO}>
        <div className="mt-auto">
          {loading ? (
            <>
              <div className="flex h-12 items-center sm:h-14">
                <Loader2 className="size-7 animate-spin text-neutral-300" />
              </div>
              <p className="mt-2 text-xs text-neutral-400">Measuring searches…</p>
            </>
          ) : (
            <>
              <p
                className={cn(
                  "text-4xl font-medium tabular-nums tracking-tight sm:text-5xl",
                  toneClass(vTone)
                )}
              >
                {formatPct(visibility)}
              </p>
              <p className="mt-2 text-xs text-neutral-400">
                {cited} of {total || 0} searches named you
              </p>
            </>
          )}
        </div>
      </StatBlock>

      <StatBlock label="Competitors" info={COMPETITORS_INFO} last>
        <MiniCompetitorChart bars={bars} total={total || 0} loading={loading} />
      </StatBlock>
    </div>
  );
}
