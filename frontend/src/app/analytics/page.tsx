"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnalysisStep, GeneratedPrompt, WebsiteAnalysis } from "@/lib/types";
import PromptsStep from "@/components/analytics/PromptsStep";
import ResultsStep from "@/components/analytics/ResultsStep";
import { buildPendingAnalysis } from "@/lib/pending-analysis";
import {
  CANNED_ANALYSIS_MIN_MS,
  CANNED_PROMPTS_MIN_MS,
  brandIconUrl,
  buildCannedAnalysis,
  getCannedExample,
  isCannedDomain,
  sleep,
} from "@/lib/demo-test";
import { trpc } from "@/lib/trpc";

type SiteMeta = {
  domain: string;
  url: string;
  title: string;
  description: string | null;
  image: string | null;
};

type PreloadBundle = {
  key: string;
  analysis: WebsiteAnalysis;
  apiResponse: unknown;
};

function normalizeDomain(raw: string): string {
  return raw
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .split("/")[0]
    .toLowerCase();
}

function promptsKey(prompts: GeneratedPrompt[]): string {
  return prompts
    .map((p) => p.prompt.trim().toLowerCase())
    .filter(Boolean)
    .join("\n");
}

function warmupAssets(domain: string, meta?: SiteMeta | null) {
  if (typeof window === "undefined" || !domain) return;
  const urls = [
    brandIconUrl(domain, 64),
    `https://image.thum.io/get/width/1200/crop/600/noanimate/https://${domain}`,
  ];
  if (meta?.image) urls.push(meta.image);
  for (const src of urls) {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
  }
}

function AnalyticsContent() {
  const [currentStep, setCurrentStep] = useState<AnalysisStep>("prompts");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [generatedPrompts, setGeneratedPrompts] = useState<GeneratedPrompt[]>(
    []
  );
  const [analysisResults, setAnalysisResults] =
    useState<WebsiteAnalysis | null>(null);
  const [apiResponse, setApiResponse] = useState<unknown>(null);
  const [siteMeta, setSiteMeta] = useState<SiteMeta | null>(null);
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  const generatePrompts = trpc.generatePrompts.useMutation();
  const analyze = trpc.analyze.useMutation();

  const preloadRef = useRef<{
    key: string;
    promise: Promise<PreloadBundle>;
  } | null>(null);
  const preloadRunId = useRef(0);

  const domain = useMemo(
    () => (websiteUrl ? normalizeDomain(websiteUrl) : ""),
    [websiteUrl]
  );

  const startAnalysisPreload = useCallback(
    (url: string, prompts: GeneratedPrompt[]) => {
      const key = promptsKey(prompts);
      if (!key) return;

      // Reuse in-flight / finished preload for the same prompt set
      if (preloadRef.current?.key === key) return;

      const runId = ++preloadRunId.current;
      const promise = (async (): Promise<PreloadBundle> => {
        const data = await Promise.race([
          analyze.mutateAsync({ url, prompts }),
          new Promise<never>((_, reject) =>
            window.setTimeout(
              () =>
                reject(
                  new Error(
                    "Analysis timed out. The AI search took too long — try again with fewer prompts."
                  )
                ),
              180_000
            )
          ),
        ]);
        if (!data.analysis?.visibility) {
          throw new Error("Analysis response missing visibility report");
        }
        const bundle: PreloadBundle = {
          key,
          analysis: data.analysis,
          apiResponse: data.apiResponse,
        };
        // Stash onto the active preload slot if this run is still current
        if (runId === preloadRunId.current) {
          preloadRef.current = { key, promise: Promise.resolve(bundle) };
        }
        return bundle;
      })();

      preloadRef.current = { key, promise };
      // Warm competitor favicons once results resolve
      promise
        .then((bundle) => {
          const topics = bundle.analysis.visibility?.topics || [];
          const domains = new Set<string>();
          for (const t of topics) {
            for (const sq of t.sub_queries || []) {
              for (const d of sq.all_domains || []) domains.add(d);
              for (const s of sq.sources || []) domains.add(s.domain);
            }
          }
          for (const d of [...domains].slice(0, 24)) {
            const img = new Image();
            img.decoding = "async";
            img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=32`;
          }
        })
        .catch(() => {
          /* confirm path surfaces errors */
        });
    },
    [analyze]
  );

  // Load prompts + site meta as soon as URL is known
  useEffect(() => {
    const urlParam = searchParams.get("url");
    if (!urlParam) {
      router.push("/");
      return;
    }

    setWebsiteUrl(urlParam);
    const host = normalizeDomain(urlParam);
    const canned = getCannedExample(host);

    let cancelled = false;
    (async () => {
      try {
        setPromptsLoading(true);
        setError(null);

        if (canned) {
          // Known-brand / demo pills — hard-coded, no paid APIs
          await sleep(CANNED_PROMPTS_MIN_MS);
          if (cancelled) return;
          setSiteMeta(canned.meta);
          warmupAssets(host, canned.meta);
          setGeneratedPrompts(canned.prompts);
          return;
        }

        // Site meta in parallel with prompt generation
        const metaPromise = fetch(
          `/api/site-meta?domain=${encodeURIComponent(host)}`
        )
          .then(async (res) => (res.ok ? ((await res.json()) as SiteMeta) : null))
          .catch(() => null);

        const [promptData, meta] = await Promise.all([
          generatePrompts.mutateAsync({ url: urlParam }),
          metaPromise,
        ]);

        if (cancelled) return;

        if (meta) {
          setSiteMeta(meta);
          warmupAssets(host, meta);
        } else {
          warmupAssets(host);
        }

        setGeneratedPrompts(promptData.prompts);
        // Kick off ChatGPT fan-out while the user reviews prompts
        startAnalysisPreload(urlParam, promptData.prompts);
      } catch (err) {
        console.error("Error generating prompts:", err);
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to generate prompts. Please try again."
          );
        }
      } finally {
        if (!cancelled) setPromptsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per url
  }, [searchParams, router]);

  const handlePromptsConfirm = async (selectedPrompts: GeneratedPrompt[]) => {
    setGeneratedPrompts(selectedPrompts);
    setError(null);

    const host = domain || normalizeDomain(websiteUrl);
    // Show dashboard shell immediately (title, thumbnail, prompts)
    setAnalysisResults(buildPendingAnalysis(host, selectedPrompts));
    setMetricsLoading(true);
    setCurrentStep("results");

    const key = promptsKey(selectedPrompts);

    try {
      if (isCannedDomain(host)) {
        await sleep(CANNED_ANALYSIS_MIN_MS);
        const analysis = buildCannedAnalysis(host, selectedPrompts);
        setAnalysisResults(analysis);
        setApiResponse({
          success: true,
          metadata: { data_source: "canned", target_domain: host },
          data: { visibility: analysis.visibility },
        });
        return;
      }

      let bundle: PreloadBundle;

      if (preloadRef.current?.key === key) {
        bundle = await preloadRef.current.promise;
      } else {
        const data = await Promise.race([
          analyze.mutateAsync({
            url: websiteUrl,
            prompts: selectedPrompts,
          }),
          new Promise<never>((_, reject) =>
            window.setTimeout(
              () =>
                reject(
                  new Error(
                    "Analysis timed out. The AI search took too long — try again with fewer prompts."
                  )
                ),
              180_000
            )
          ),
        ]);
        if (!data.analysis?.visibility) {
          throw new Error("Analysis response missing visibility report");
        }
        bundle = {
          key,
          analysis: data.analysis,
          apiResponse: data.apiResponse,
        };
        preloadRef.current = { key, promise: Promise.resolve(bundle) };
      }

      setAnalysisResults(bundle.analysis);
      setApiResponse(bundle.apiResponse);
    } catch (err) {
      console.error("Error analyzing website:", err);
      // Drop failed preload so a retry can start fresh
      if (preloadRef.current?.key === key) {
        preloadRef.current = null;
      }
      setError(
        err instanceof Error
          ? err.message
          : "Failed to analyze website. Please try again."
      );
      setCurrentStep("prompts");
      setAnalysisResults(null);
    } finally {
      setMetricsLoading(false);
    }
  };

  const handleBack = () => {
    router.push("/");
  };

  const handleNewAnalysis = () => {
    router.push("/");
  };

  if (error && !promptsLoading && generatedPrompts.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[oklch(0.985_0.002_260)] px-6">
        <div className="max-w-sm text-center">
          <p className="font-display text-xl text-neutral-900">
            Something went wrong
          </p>
          <p className="mt-2 text-sm text-neutral-500">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#f4f4f5]">
      {currentStep === "results" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 40% at 50% 0%, oklch(0.96 0.01 250), transparent 60%)",
          }}
        />
      )}
      <main
        className={`relative z-10 mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 pb-16 sm:px-6 ${
          currentStep === "results" && metricsLoading
            ? "justify-center pt-4"
            : "pt-10"
        }`}
      >
        {error && currentStep === "results" && (
          <div className="mx-auto mb-4 w-full max-w-4xl rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {error && currentStep === "prompts" && (
          <div className="mx-auto mb-4 w-full max-w-xl rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {currentStep === "prompts" && (
          <PromptsStep
            prompts={generatedPrompts}
            onConfirm={handlePromptsConfirm}
            onBack={handleBack}
            domain={domain || undefined}
            loading={promptsLoading}
          />
        )}

        {currentStep === "results" && analysisResults && (
          <ResultsStep
            analysis={analysisResults}
            onNewAnalysis={handleNewAnalysis}
            apiResponse={apiResponse}
            initialMeta={siteMeta}
            metricsLoading={metricsLoading}
          />
        )}
      </main>
    </div>
  );
}

function AnalyticsFallback() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#f4f4f5]">
      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 pb-16 pt-10 sm:px-6">
        <PromptsStep
          prompts={[]}
          onConfirm={() => {}}
          onBack={() => {}}
          loading
        />
      </main>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<AnalyticsFallback />}>
      <AnalyticsContent />
    </Suspense>
  );
}
