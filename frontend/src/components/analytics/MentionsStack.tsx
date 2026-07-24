"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { MentionSource } from "@/lib/types";
import { brandIconUrl } from "@/lib/demo-test";

export function faviconUrl(domain: string): string {
  return brandIconUrl(domain, 32);
}

type PanelPos = { top: number; left: number; width: number };

function toSources(
  domains: string[] | undefined,
  sources: MentionSource[] | undefined,
  target: string
): MentionSource[] {
  if (sources?.length) {
    const sorted = [...sources];
    sorted.sort((a, b) => {
      const aYou =
        a.is_you || a.domain.toLowerCase() === target.toLowerCase() ? 0 : 1;
      const bYou =
        b.is_you || b.domain.toLowerCase() === target.toLowerCase() ? 0 : 1;
      return aYou - bYou;
    });
    return sorted;
  }
  return (domains || []).map((d) => ({
    domain: d,
    url: `https://${d}`,
    title: d,
    is_you: d.toLowerCase() === target.toLowerCase(),
  }));
}

export function MentionsStack({
  domains,
  sources,
  target,
  max = 5,
  className,
}: {
  domains?: string[];
  sources?: MentionSource[];
  target: string;
  max?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const items = toSources(domains, sources, target);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;

    const place = () => {
      const btn = rootRef.current?.getBoundingClientRect();
      if (!btn) return;
      const width = 320;
      const gap = 6;
      const pad = 8;
      let left = btn.right - width;
      left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));
      let top = btn.bottom + gap;
      const panelH = panelRef.current?.offsetHeight ?? 280;
      if (top + panelH > window.innerHeight - pad && btn.top > panelH + gap) {
        top = btn.top - panelH - gap;
      }
      setPos({ top, left, width });
    };

    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) {
    return (
      <span className={cn("text-xs text-neutral-400", className)}>-</span>
    );
  }

  const shown = items.slice(0, max);
  const extra = items.length - shown.length;

  const panel =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={panelRef}
        style={{
          position: "fixed",
          top: pos?.top ?? -9999,
          left: pos?.left ?? 0,
          width: pos?.width ?? 320,
          zIndex: 80,
          visibility: pos ? "visible" : "hidden",
        }}
        className="overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="border-b border-neutral-100 px-3 py-1.5 text-xs text-neutral-400">
          Ranked mentions ({items.length})
        </p>
        <ul className="max-h-64 overflow-y-auto">
          {items.map((s, i) => {
            const isYou =
              s.is_you || s.domain.toLowerCase() === target.toLowerCase();
            return (
              <li key={`${s.domain}-${s.url}`}>
                <a
                  href={s.url.startsWith("http") ? s.url : `https://${s.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-start gap-2.5 px-3 py-2 text-sm hover:bg-neutral-50",
                    isYou && "bg-emerald-50 hover:bg-emerald-50"
                  )}
                >
                  <span className="mt-0.5 w-5 shrink-0 text-[11px] tabular-nums text-neutral-400">
                    #{i + 1}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={faviconUrl(s.domain)}
                    alt=""
                    className="mt-0.5 size-4 shrink-0"
                    loading="lazy"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate font-medium",
                        isYou ? "text-emerald-800" : "text-neutral-800"
                      )}
                    >
                      {s.domain}
                      {isYou ? " (you)" : ""}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-neutral-400">
                      {s.url.replace(/^https?:\/\//, "")}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>,
      document.body
    );

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex items-center rounded-md px-0.5 py-0.5 hover:bg-neutral-100"
        aria-expanded={open}
        aria-label="Show mentioned companies"
      >
        <div className="flex -space-x-1.5">
          {shown.map((s) => (
            <span
              key={s.domain}
              title={s.domain}
              className="inline-flex size-5 items-center justify-center overflow-hidden rounded-full border border-white bg-neutral-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={faviconUrl(s.domain)}
                alt=""
                className="size-3.5"
                loading="lazy"
              />
            </span>
          ))}
        </div>
        {extra > 0 && (
          <span className="ml-1.5 text-xs tabular-nums text-neutral-400">
            +{extra}
          </span>
        )}
      </button>
      {panel}
    </div>
  );
}
