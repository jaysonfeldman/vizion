"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WebsiteAnalysis, VisibilityReport, AnalyzeApiResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { RefreshCw, ArrowUpRight } from "lucide-react";
import { InsightsBar } from "@/components/analytics/InsightsBar";
import { PromptTable } from "@/components/analytics/PromptTable";
import { faviconUrl } from "@/components/analytics/MentionsStack";
import { WaveDotLoader } from "@/components/dot-matrix/WaveDotLoader";
import { cn } from "@/lib/utils";

type SiteMeta = {
  domain: string;
  url: string;
  title: string;
  description: string | null;
  image: string | null;
};

interface ResultsStepProps {
  analysis: WebsiteAnalysis;
  onNewAnalysis: () => void;
  apiResponse?: AnalyzeApiResponse | unknown;
  initialMeta?: SiteMeta | null;
  metricsLoading?: boolean;
}

const LOADING_MESSAGES = [
  "Generating your insights…",
  "Analyzing search queries…",
  "Checking AI mentions…",
  "Mapping competitor sources…",
];

/**
 * Clean, readable subtitle from site meta (decode entities, drop broken glyphs).
 */
function cleanText(raw: string): string {
  let s = raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try {
        return String.fromCodePoint(parseInt(h, 16));
      } catch {
        return "";
      }
    })
    .replace(/&#(\d+);/g, (_, d) => {
      try {
        return String.fromCodePoint(parseInt(d, 10));
      } catch {
        return "";
      }
    })
    // Zero-width / replacement / control chars that show as tofu boxes
    .replace(/[\u0000-\u001F\u007F-\u009F\uFFFD\u200B-\u200D\uFEFF]/g, "")
    // Fancy bullets / icons that often fail fonts
    .replace(/[●◆■□▪▫★☆✓✔✕✖►◆◇•‣⁃∙]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

function siteTagline(meta: SiteMeta | null, fallback: string): string {
  const desc = cleanText(meta?.description || "");
  const title = cleanText(meta?.title || "");

  const firstSentence = (text: string) => {
    const s = text.split(/(?<=[.!?])\s+/)[0] || text;
    return s.trim();
  };

  const clip = (text: string, max = 96) => {
    if (text.length <= max) return text;
    const cut = text.slice(0, max - 1);
    const at = cut.lastIndexOf(" ");
    return `${(at > 36 ? cut.slice(0, at) : cut).trim()}…`;
  };

  // Prefer a clean title tagline ("Notion - AI workspace") over messy OG descriptions
  if (title) {
    const parts = title
      .split(/\s*[|\u2013\u2014-]\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      const tag = clip(`${parts[0]}: ${parts.slice(1).join(" ")}`, 100);
      if (tag.length >= 20) return tag;
    }
  }

  if (desc) {
    let phrase = firstSentence(desc);
    if (phrase.length < 36 && title) {
      const head = title.split(/\s*[|\u2013\u2014-]\s*/)[0]?.trim();
      if (head) phrase = `${head}: ${phrase}`;
    }
    if (phrase.length < 40 && desc.length > phrase.length) {
      phrase = clip(desc, 88);
    }
    return clip(phrase, 100);
  }

  if (title) return clip(title, 100);
  return fallback;
}

function BannerBody({
  target,
  blurb,
  metricsLoading,
  loadingMsgIdx,
  onNewAnalysis,
  previewSrc,
  setPreviewKind,
}: {
  target: string;
  blurb: string;
  metricsLoading: boolean;
  loadingMsgIdx: number;
  onNewAnalysis: () => void;
  previewSrc: string | null;
  setPreviewKind: Dispatch<SetStateAction<"og" | "shot" | "none">>;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-stretch">
      <div className="flex min-w-0 flex-1 flex-col p-5 sm:p-6">
        <a
          href={`https://${target}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex max-w-full items-center gap-1.5"
        >
          <h1 className="font-display min-w-0 truncate text-2xl tracking-tight text-neutral-900 transition group-hover:text-neutral-700 sm:text-3xl">
            {target}
          </h1>
          <ArrowUpRight
            className="size-5 shrink-0 text-black/35 opacity-0 transition group-hover:opacity-100 sm:size-6"
            strokeWidth={2}
            aria-hidden
          />
          <span className="sr-only">Visit site</span>
        </a>
        <p className="mt-2 max-w-[17.5rem] text-balance text-sm leading-relaxed text-neutral-500">
          {blurb}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-10">
          {metricsLoading ? (
            <div className="flex items-center gap-2.5 text-sm text-neutral-600">
              <WaveDotLoader
                variant="scan"
                size={18}
                color="#0369a1"
                speedMultiplier={1.1}
                className="shrink-0"
                aria-label="Loading"
              />
              <AnimatePresence mode="wait">
                <motion.span
                  key={loadingMsgIdx}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="font-medium tracking-tight"
                >
                  {LOADING_MESSAGES[loadingMsgIdx]}
                </motion.span>
              </AnimatePresence>
            </div>
          ) : (
            <button
              type="button"
              onClick={onNewAnalysis}
              className="soft-outline inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium tracking-[-0.015em] text-black"
            >
              <RefreshCw className="size-3.5" />
              New analysis
            </button>
          )}
        </div>
      </div>

      <div className="flex min-w-0 w-full shrink-0 items-end self-stretch pt-4 pr-4 sm:w-[48%] sm:pt-5 sm:pr-5">
        <a
          href={`https://${target}`}
          target="_blank"
          rel="noopener noreferrer"
          className="soft-thumb relative block aspect-[2/1] w-full min-w-0 overflow-hidden rounded-t-xl"
        >
          <div className="absolute inset-0 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={faviconUrl(target)}
              alt=""
              className="size-10 rounded-lg bg-white p-1.5 shadow-sm"
            />
          </div>
          {previewSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewSrc}
              alt=""
              className="absolute inset-0 h-full w-full max-w-none object-cover object-top"
              onError={() =>
                setPreviewKind((k) => (k === "og" ? "shot" : "none"))
              }
            />
          )}
          {/* Mimics soft-inset bottom edge over the photo (CSS inset sits under content) */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-gradient-to-t from-black/[0.04] to-transparent"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-b from-white/35 to-transparent"
          />
        </a>
      </div>
    </div>
  );
}

export default function ResultsStep({
  analysis,
  onNewAnalysis,
  apiResponse,
  initialMeta = null,
  metricsLoading = false,
}: ResultsStepProps) {
  const v: VisibilityReport | undefined = analysis.visibility;
  const metaFromApi =
    apiResponse &&
    typeof apiResponse === "object" &&
    "metadata" in apiResponse
      ? (apiResponse as AnalyzeApiResponse).metadata
      : undefined;
  const analysisProvider =
    typeof metaFromApi?.provider === "string"
      ? metaFromApi.provider
      : metaFromApi?.data_source === "canned"
        ? "canned"
        : undefined;
  const analysisModel =
    typeof metaFromApi?.model === "string" ? metaFromApi.model : undefined;
  const [meta, setMeta] = useState<SiteMeta | null>(initialMeta);
  const [previewKind, setPreviewKind] = useState<"og" | "shot" | "none">(
    initialMeta?.image ? "og" : "og"
  );
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [revealMetrics, setRevealMetrics] = useState(!metricsLoading);

  useEffect(() => {
    if (initialMeta) setMeta(initialMeta);
  }, [initialMeta]);

  useEffect(() => {
    if (!metricsLoading) {
      // Let the banner settle to the top, then reveal metrics
      const t = window.setTimeout(() => setRevealMetrics(true), 420);
      return () => window.clearTimeout(t);
    }
    setRevealMetrics(false);
    setLoadingMsgIdx(0);
  }, [metricsLoading]);

  useEffect(() => {
    if (!metricsLoading) return;
    const id = window.setInterval(() => {
      setLoadingMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 2800);
    return () => window.clearInterval(id);
  }, [metricsLoading]);

  const topics = useMemo(() => {
    if (!v) return [];
    // Best mentioned first (then presence, then prompt alpha)
    return [...v.topics].sort((a, b) => {
      const aHit = a.cited_count || 0;
      const bHit = b.cited_count || 0;
      if (bHit !== aHit) return bHit - aHit;
      const aRate = a.citation_rate || 0;
      const bRate = b.citation_rate || 0;
      if (bRate !== aRate) return bRate - aRate;
      return a.prompt.localeCompare(b.prompt);
    });
  }, [v]);

  const target = v?.normalized_domain || analysis.domain;

  useEffect(() => {
    if (!target) return;
    if (initialMeta) {
      setMeta(initialMeta);
      setPreviewKind(initialMeta.image ? "og" : "shot");
      return;
    }
    let cancelled = false;
    setPreviewKind("og");
    (async () => {
      try {
        const res = await fetch(
          `/api/site-meta?domain=${encodeURIComponent(target)}`
        );
        if (!res.ok) {
          if (!cancelled) setPreviewKind("shot");
          return;
        }
        const data = (await res.json()) as SiteMeta;
        if (!cancelled) {
          setMeta(data);
          setPreviewKind(data.image ? "og" : "shot");
        }
      } catch {
        if (!cancelled) {
          setMeta(null);
          setPreviewKind("shot");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target, initialMeta]);

  if (!v) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <p className="text-sm text-neutral-500">No analysis data.</p>
        <Button className="mt-4" onClick={onNewAnalysis}>
          Try again
        </Button>
      </div>
    );
  }

  const blurb = siteTagline(meta, "AI visibility check");

  const previewSrc =
    previewKind === "og" && meta?.image
      ? meta.image
      : previewKind === "shot"
        ? `https://image.thum.io/get/width/1200/crop/600/noanimate/https://${target}`
        : null;

  return (
    <motion.div
      className={cn(
        "mx-auto flex w-full max-w-4xl flex-col",
        metricsLoading ? "min-h-[72vh] justify-center" : "justify-start pb-20"
      )}
      layout
      transition={{ layout: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } }}
    >
      <motion.div
        layout
        className="relative w-full"
        transition={{ layout: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } }}
      >
        {metricsLoading ? (
          <div className="banner-glow relative">
            <div className="banner-glow-aura" aria-hidden>
              <span className="banner-glow-bubble" />
              <span className="banner-glow-air banner-glow-air-a" />
              <span className="banner-glow-air banner-glow-air-b" />
              <span className="banner-glow-air banner-glow-air-c" />
              <span className="banner-glow-air banner-glow-air-d" />
            </div>
            <motion.div
              layout
              className="soft-inset relative z-10 overflow-hidden rounded-2xl"
            >
              <BannerBody
                target={target}
                blurb={blurb}
                metricsLoading
                loadingMsgIdx={loadingMsgIdx}
                onNewAnalysis={onNewAnalysis}
                previewSrc={previewSrc}
                setPreviewKind={setPreviewKind}
              />
            </motion.div>
          </div>
        ) : (
          <motion.div
            layout
            className="soft-inset relative overflow-hidden rounded-2xl"
          >
            <BannerBody
              target={target}
              blurb={blurb}
              metricsLoading={false}
              loadingMsgIdx={loadingMsgIdx}
              onNewAnalysis={onNewAnalysis}
              previewSrc={previewSrc}
              setPreviewKind={setPreviewKind}
            />
          </motion.div>
        )}
      </motion.div>

      <AnimatePresence>
        {revealMetrics && !metricsLoading && (
          <motion.div
            key="metrics"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
            className="soft-inset mt-6 overflow-hidden rounded-2xl"
          >
            <InsightsBar topics={topics} target={target} kpis={v.kpis} />
            <PromptTable
              topics={topics}
              target={target}
              connected
              provider={analysisProvider}
              model={analysisModel}
            />
            {(analysisProvider || analysisModel) && (
              <p className="border-t border-black/5 px-5 py-3 text-[11px] tracking-[-0.01em] text-black/35 sm:px-6">
                Analyzed with{" "}
                {analysisProvider === "chatgpt"
                  ? "ChatGPT"
                  : analysisProvider === "gemini"
                    ? "Gemini"
                    : analysisProvider === "canned"
                      ? "demo data"
                      : analysisProvider || "AI"}
                {analysisModel ? ` · ${analysisModel}` : ""}
                {metaFromApi?.cache_hit ? " · cached" : ""}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
