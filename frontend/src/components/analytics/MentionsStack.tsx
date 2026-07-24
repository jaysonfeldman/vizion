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

function placeLabel(index: number): string {
  const n = index + 1;
  const mod = n % 100;
  if (mod >= 11 && mod <= 13) return `${n}th place`;
  switch (n % 10) {
    case 1:
      return `${n}st place`;
    case 2:
      return `${n}nd place`;
    case 3:
      return `${n}rd place`;
    default:
      return `${n}th place`;
  }
}

function displayTitle(s: MentionSource): string {
  const title = (s.title || "").trim();
  const domain = s.domain.toLowerCase();
  if (
    title &&
    title.toLowerCase() !== domain &&
    title.toLowerCase() !== `www.${domain}` &&
    !/^https?:\/\//i.test(title)
  ) {
    return title;
  }
  return s.domain;
}

function providerLabel(provider?: string, model?: string): string | null {
  if (!provider && !model) return null;
  const name =
    provider === "chatgpt"
      ? "ChatGPT"
      : provider === "gemini"
        ? "Gemini"
        : provider === "canned"
          ? "Demo"
          : provider || "AI";
  return model ? `${name} · ${model}` : name;
}

export function MentionsStack({
  domains,
  sources,
  target,
  max = 5,
  className,
  provider,
  model,
  defaultOpen = false,
}: {
  domains?: string[];
  sources?: MentionSource[];
  target: string;
  max?: number;
  className?: string;
  /** e.g. chatgpt | gemini — shown in the popup footer */
  provider?: string;
  model?: string;
  /** Open the panel on mount (useful for Storybook) */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [pos, setPos] = useState<PanelPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const items = toSources(domains, sources, target);
  const via = providerLabel(provider, model);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;

    const place = () => {
      const btn = rootRef.current?.getBoundingClientRect();
      if (!btn) return;
      const width = 340;
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
          width: pos?.width ?? 340,
          zIndex: 80,
          visibility: pos ? "visible" : "hidden",
        }}
        className="soft-outline overflow-hidden rounded-2xl py-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="px-3.5 py-2 text-xs text-black/40">
          Ranked mentions ({items.length})
        </p>
        <ul className="max-h-72 overflow-y-auto">
          {items.map((s, i) => {
            const isYou =
              s.is_you || s.domain.toLowerCase() === target.toLowerCase();
            const isFirst = i === 0;
            return (
              <li key={`${s.domain}-${s.url}`}>
                <a
                  href={s.url.startsWith("http") ? s.url : `https://${s.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-center gap-3 px-3.5 py-2.5 text-sm transition-colors hover:bg-black/[0.03]",
                    isYou && "bg-emerald-50/80 hover:bg-emerald-50"
                  )}
                >
                  <span className="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={faviconUrl(s.domain)}
                      alt=""
                      className="size-5 object-contain"
                      loading="lazy"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate font-medium tracking-[-0.015em]",
                        isYou ? "text-emerald-800" : "text-neutral-900"
                      )}
                    >
                      {displayTitle(s)}
                      {isYou ? " (you)" : ""}
                    </span>
                    <span className="mt-0.5 block text-[11px] tracking-[-0.01em] text-black/40">
                      {placeLabel(i)}
                    </span>
                  </span>
                  {isFirst ? (
                    <span
                      className="shrink-0 text-lg leading-none"
                      role="img"
                      aria-label="1st place"
                    >
                      🏆
                    </span>
                  ) : (
                    <span className="size-5 shrink-0" aria-hidden />
                  )}
                </a>
              </li>
            );
          })}
        </ul>
        {via ? (
          <p className="px-3.5 py-2 text-[11px] tracking-[-0.01em] text-black/35">
            Analyzed with {via}
          </p>
        ) : null}
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
