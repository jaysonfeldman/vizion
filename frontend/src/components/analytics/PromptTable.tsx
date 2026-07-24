"use client";

import { useMemo, useState } from "react";
import type { MentionSource, TopicResult } from "@/lib/types";
import { Check, ChevronDown, ChevronRight, Loader2, Minus } from "lucide-react";
import { cn, formatPromptLabel } from "@/lib/utils";
import { MentionsStack } from "@/components/analytics/MentionsStack";

/**
 * One shared column template for title, headers, parents, and children
 * so Mentions / Sources stay on the same vertical rails.
 */
const COLS =
  "grid-cols-[1.75rem_minmax(0,1fr)_4.75rem_9.5rem] gap-x-3 px-5 sm:gap-x-4 sm:px-6";

export function topicSources(
  topic: TopicResult,
  target: string
): MentionSource[] {
  const byDomain = new Map<string, MentionSource>();
  for (const sq of topic.sub_queries) {
    const list =
      sq.sources ||
      (sq.all_domains || []).map((d) => ({
        domain: d,
        url: `https://${d}`,
        title: d,
        is_you: d.toLowerCase() === target.toLowerCase(),
      }));
    for (const s of list) {
      const key = s.domain.toLowerCase();
      const existing = byDomain.get(key);
      if (!existing) {
        byDomain.set(key, { ...s });
      } else if (
        s.url &&
        s.url !== `https://${s.domain}` &&
        existing.url === `https://${existing.domain}`
      ) {
        existing.url = s.url;
        existing.title = s.title || existing.title;
      }
    }
  }
  const out = [...byDomain.values()];
  out.sort((a, b) => {
    const aT =
      a.is_you || a.domain.toLowerCase() === target.toLowerCase() ? 0 : 1;
    const bT =
      b.is_you || b.domain.toLowerCase() === target.toLowerCase() ? 0 : 1;
    return aT - bT;
  });
  return out;
}

function MentionFraction({
  topic,
  loading,
}: {
  topic: TopicResult;
  loading?: boolean;
}) {
  if (loading) {
    return <Loader2 className="size-3.5 animate-spin text-neutral-300" />;
  }
  const total = topic.sub_queries?.length || topic.sub_query_count || 0;
  const hit = topic.cited_count || 0;
  const pct = total ? Math.round((hit / total) * 100) : 0;
  const tone =
    total === 0 || hit === 0 ? "text-neutral-400" : "text-emerald-600";
  return (
    <span
      className={cn("text-sm tabular-nums font-medium", tone)}
      title={total ? `${hit} of ${total} searches` : "No searches yet"}
    >
      {total ? `${pct}%` : "–"}
    </span>
  );
}

function StatusLabel({
  status,
}: {
  status: "cited" | "retrieved" | "missing";
}) {
  if (status === "cited") {
    return (
      <span
        className="inline-flex text-emerald-600"
        title="Named in the AI answer"
      >
        <Check className="size-3.5" strokeWidth={2.5} aria-label="Cited" />
      </span>
    );
  }
  if (status === "retrieved") {
    return (
      <span
        className="inline-flex text-amber-500"
        title="In sources, but not named in the answer"
      >
        <Check className="size-3.5" strokeWidth={2.5} aria-label="Found" />
      </span>
    );
  }
  return (
    <span
      className="inline-flex text-neutral-300"
      title="Not in answer or sources"
    >
      <Minus className="size-3.5" strokeWidth={2.25} aria-label="Missing" />
    </span>
  );
}

function FanOutPanel({
  topic,
  target,
  provider,
  model,
}: {
  topic: TopicResult;
  target: string;
  provider?: string;
  model?: string;
}) {
  return (
    <div className="border-t border-neutral-100 bg-neutral-50/80">
      {topic.sub_queries.map((sq, i) => (
        <div
          key={sq.query}
          className={cn(
            "grid items-center py-2.5",
            COLS,
            i > 0 && "border-t border-neutral-100/70"
          )}
        >
          <span className="size-7" aria-hidden />
          <p className="min-w-0 pl-1 text-[13px] leading-snug text-neutral-500">
            {formatPromptLabel(sq.query)}
          </p>
          <div className="flex justify-start">
            <StatusLabel status={sq.status} />
          </div>
          <div className="flex min-w-0 items-center justify-start overflow-hidden">
            <MentionsStack
              sources={sq.sources}
              domains={sq.all_domains}
              target={target}
              max={3}
              provider={provider}
              model={model}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function PromptRow({
  topic,
  target,
  open,
  onToggle,
  loading,
  provider,
  model,
}: {
  topic: TopicResult;
  target: string;
  open: boolean;
  onToggle: () => void;
  loading?: boolean;
  provider?: string;
  model?: string;
}) {
  const sources = useMemo(
    () => topicSources(topic, target),
    [topic, target]
  );
  const canExpand = !loading && (topic.sub_queries?.length || 0) > 0;

  return (
    <div
      className={cn(
        "border-b border-neutral-100 last:border-0",
        open && "bg-white"
      )}
    >
      <div
        role="button"
        tabIndex={canExpand ? 0 : -1}
        aria-expanded={open}
        onClick={() => {
          if (canExpand) onToggle();
        }}
        onKeyDown={(e) => {
          if (!canExpand) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className={cn(
          "grid w-full items-center py-3.5 text-left transition-colors",
          COLS,
          canExpand ? "cursor-pointer" : "cursor-default",
          open ? "bg-neutral-50/60" : canExpand && "hover:bg-neutral-50/40"
        )}
      >
        <span className="flex size-7 items-center justify-center text-neutral-400">
          {loading ? (
            <Loader2 className="size-3.5 animate-spin text-neutral-300" />
          ) : canExpand ? (
            open ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )
          ) : (
            <span className="size-4" />
          )}
        </span>

        <p className="min-w-0 text-sm font-medium leading-snug text-neutral-900">
          {formatPromptLabel(topic.prompt)}
        </p>

        <div className="flex justify-start">
          <MentionFraction topic={topic} loading={loading} />
        </div>

        <div className="flex min-w-0 items-center justify-start overflow-hidden">
          {loading ? (
            <span className="text-xs text-neutral-300">…</span>
          ) : (
            <MentionsStack
              sources={sources}
              target={target}
              provider={provider}
              model={model}
            />
          )}
        </div>
      </div>
      {open && canExpand && (
        <FanOutPanel
          topic={topic}
          target={target}
          provider={provider}
          model={model}
        />
      )}
    </div>
  );
}

export function PromptTable({
  topics,
  target,
  defaultOpenFirst = false,
  connected = false,
  loading = false,
  provider,
  model,
}: {
  topics: TopicResult[];
  target: string;
  defaultOpenFirst?: boolean;
  connected?: boolean;
  loading?: boolean;
  provider?: string;
  model?: string;
}) {
  const [openPrompt, setOpenPrompt] = useState<string | null>(
    defaultOpenFirst ? topics[0]?.prompt ?? null : null
  );

  return (
    <div
      className={
        connected ? "" : "rounded-xl border border-neutral-200 bg-white"
      }
    >
      {/* Single header on the same grid as every data row */}
      <div
        className={cn(
          "grid items-center border-b border-neutral-100 py-2.5 text-xs text-neutral-400",
          COLS
        )}
      >
        <div className="col-span-2 min-w-0">
          <span className="text-sm font-medium text-neutral-900">Prompts</span>
        </div>
        <span className="text-left">Mentions</span>
        <span className="text-left">Sources</span>
      </div>

      {topics.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-neutral-400 sm:px-6">
          No prompts in this run.
        </p>
      ) : (
        topics.map((topic) => (
          <PromptRow
            key={topic.prompt}
            topic={topic}
            target={target}
            loading={loading}
            provider={provider}
            model={model}
            open={!loading && openPrompt === topic.prompt}
            onToggle={() =>
              setOpenPrompt(
                openPrompt === topic.prompt ? null : topic.prompt
              )
            }
          />
        ))
      )}
    </div>
  );
}
