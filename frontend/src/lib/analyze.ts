import { GeneratedPrompt, WebsiteAnalysis, AnalyzeApiResponse } from "@/lib/types";

export function extractDomain(url: string): string {
  try {
    const withScheme = url.startsWith("http") ? url : `https://${url}`;
    const urlObj = new URL(withScheme);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^www\./, "").split("/")[0];
  }
}

export async function analyzeWebsite(args: {
  url: string;
  prompts: GeneratedPrompt[];
}): Promise<{ analysis: WebsiteAnalysis; apiResponse: AnalyzeApiResponse }> {
  const { url, prompts } = args;
  if (!url || !prompts?.length) {
    throw new Error("URL and prompts are required");
  }

  const targetDomain = extractDomain(url);
  const promptStrings = prompts.map((p) => p.prompt);
  const promptCategories: Record<string, string> = {};
  for (const p of prompts) {
    if (p.prompt) promptCategories[p.prompt] = p.category || "General";
  }

  const pythonApiUrl = process.env.PYTHON_API_URL || "http://localhost:8000/analyze";
  const response = await fetch(pythonApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_domain: targetDomain,
      prompts: promptStrings,
      prompt_categories: promptCategories,
    }),
    signal: AbortSignal.timeout(300_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let detail = errorText;
    try {
      const parsed = JSON.parse(errorText) as { detail?: unknown };
      if (typeof parsed.detail === "string" && parsed.detail.trim()) {
        detail = parsed.detail.trim();
      }
    } catch {
      /* keep raw body */
    }
    throw new Error(detail);
  }

  const pythonResponse = (await response.json()) as AnalyzeApiResponse;

  if (!pythonResponse.success || !pythonResponse.data?.visibility) {
    throw new Error(
      pythonResponse.error || "Analysis response missing visibility report"
    );
  }

  const analysis: WebsiteAnalysis = {
    url,
    domain: pythonResponse.data.visibility.normalized_domain || targetDomain,
    visibility: pythonResponse.data.visibility,
    totalQueries: pythonResponse.data.visibility.kpis.sample_size,
    averageRanking: pythonResponse.data.visibility.kpis.avg_rank ?? 0,
    overallVisibility: pythonResponse.data.visibility.visibility_score,
    topCategory: prompts[0]?.category || "General",
  };

  return { analysis, apiResponse: pythonResponse };
}
