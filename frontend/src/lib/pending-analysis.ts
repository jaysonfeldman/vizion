import type {
  GeneratedPrompt,
  TopicResult,
  WebsiteAnalysis,
  VisibilityReport,
} from "@/lib/types";

/** Empty dashboard shell so results UI can render before ChatGPT fan-out finishes. */
export function buildPendingAnalysis(
  domain: string,
  prompts: GeneratedPrompt[]
): WebsiteAnalysis {
  const topics: TopicResult[] = prompts
    .map((p) => p.prompt.trim())
    .filter(Boolean)
    .map((prompt) => ({
      prompt,
      category: "General",
      sub_query_count: 0,
      citation_rate: 0,
      presence_rate: 0,
      cited_count: 0,
      retrieved_count: 0,
      missing_count: 0,
      sub_queries: [],
    }));

  const visibility: VisibilityReport = {
    normalized_domain: domain,
    domain_suggestion: null,
    visibility_score: 0,
    verdict: "very_low",
    verdict_label: "Measuring",
    verdict_summary: "Measuring visibility…",
    verdict_blurb: "Running live AI searches for these prompts.",
    kpis: {
      citation_rate: 0,
      presence_rate: 0,
      avg_rank: null,
      share_of_voice: 0,
      sample_size: 0,
      cited_count: 0,
      retrieved_count: 0,
      missing_count: 0,
      topic_count: topics.length,
    },
    topics,
    competitors: [],
    recommendations: [],
    top_competitor: null,
  };

  return {
    url: `https://${domain}`,
    domain,
    visibility,
    totalQueries: 0,
    averageRanking: 0,
    overallVisibility: 0,
  };
}
