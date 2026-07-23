"use client";

import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { Gauge, Quote, LayoutList } from "lucide-react";

export type StatItem = {
  label: string;
  value: string;
  hint?: string;
  /** 0–1 for the mini bar */
  progress?: number;
  tone?: "neutral" | "good" | "warn" | "bad";
  icon?: ComponentType<{ className?: string }>;
};

const toneStyles = {
  neutral: {
    icon: "bg-neutral-100 text-neutral-600",
    bar: "bg-neutral-900",
  },
  good: {
    icon: "bg-emerald-50 text-emerald-700",
    bar: "bg-emerald-600",
  },
  warn: {
    icon: "bg-amber-50 text-amber-700",
    bar: "bg-amber-500",
  },
  bad: {
    icon: "bg-rose-50 text-rose-700",
    bar: "bg-rose-500",
  },
};

export function StatStrip({
  stats,
  className,
}: {
  stats: StatItem[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200",
        stats.length <= 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4",
        className
      )}
    >
      {stats.map((s) => {
        const tone = s.tone || "neutral";
        const Icon = s.icon;
        const styles = toneStyles[tone];
        return (
          <div key={s.label} className="bg-white px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-neutral-500">{s.label}</p>
              {Icon && (
                <span
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-lg",
                    styles.icon
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
              )}
            </div>
            <p className="font-display mt-2 text-2xl tracking-tight text-neutral-900 tabular-nums">
              {s.value}
            </p>
            {s.hint && (
              <p className="mt-1 text-xs text-neutral-400">{s.hint}</p>
            )}
            {typeof s.progress === "number" && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={cn("h-full rounded-full transition-all", styles.bar)}
                  style={{
                    width: `${Math.max(0, Math.min(100, Math.round(s.progress * 100)))}%`,
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export { Gauge, Quote, LayoutList };
