export interface GeneratedPrompt {
  id: string;
  prompt: string;
  category: string;
  selected: boolean;
  queries: string[];
}

export type AnalysisStep = "input" | "prompts" | "analyzing" | "results";

export type VisibilityVerdict = "strong" | "moderate" | "low" | "very_low";

export interface VisibilityKpis {
  citation_rate: number;
  presence_rate: number;
  avg_rank: number | null;
  share_of_voice: number;
  sample_size: number;
  cited_count: number;
  retrieved_count: number;
  missing_count: number;
  topic_count: number;
}

export interface MentionSource {
  domain: string;
  url: string;
  title?: string;
  is_you?: boolean;
}

export interface SubQueryResult {
  query: string;
  status: "cited" | "retrieved" | "missing";
  retrieved: boolean;
  cited: boolean;
  rank: number | null;
  avg_rank: number | null;
  total_citations: number;
  total_sources: number;
  all_domains: string[];
  sources?: MentionSource[];
  winner: string | null;
  matched_as: string | null;
}

export interface TopicResult {
  prompt: string;
  category: string;
  sub_query_count: number;
  citation_rate: number;
  presence_rate: number;
  cited_count: number;
  retrieved_count: number;
  missing_count: number;
  sub_queries: SubQueryResult[];
}

export interface CompetitorResult {
  domain: string;
  citations: number;
  presence: number;
  share_of_voice: number;
}

export interface RecommendationResult {
  priority: "high" | "medium" | "low" | string;
  topic: string | null;
  query: string | null;
  insight: string;
  competitor: string | null;
  evidence: string | null;
  source: string;
}

export interface VisibilityReport {
  normalized_domain: string;
  domain_suggestion: string | null;
  visibility_score: number;
  verdict: VisibilityVerdict;
  verdict_label: string;
  verdict_summary: string;
  verdict_blurb: string;
  kpis: VisibilityKpis;
  topics: TopicResult[];
  competitors: CompetitorResult[];
  recommendations: RecommendationResult[];
  top_competitor: CompetitorResult | null;
}

export interface WebsiteAnalysis {
  url: string;
  domain: string;
  visibility: VisibilityReport;
  /** @deprecated kept for transitional UI */
  totalQueries?: number;
  averageRanking?: number;
  overallVisibility?: number;
  topCategory?: string;
  results?: never[];
}

export interface AnalyzeApiResponse {
  success: boolean;
  data?: {
    visibility: VisibilityReport;
    [key: string]: unknown;
  };
  metadata?: {
    target_domain?: string;
    domain_suggestion?: string | null;
    sample_size?: number;
    data_source?: string;
    cache_hit?: boolean;
    [key: string]: unknown;
  };
  error?: string;
}

/** Legacy row type — still referenced by old table helpers; prefer TopicResult. */
export interface AnalysisResult {
  id: string;
  query: string;
  prompt: string;
  isMentioned: boolean;
  averageRanking: number;
  totalSearches: number;
  appearsInSearches: number;
  totalSources: number;
  visibility: number;
  promptCount: number;
  category: string;
  timestamp: Date;
  targetDomainRetrieved: boolean;
  targetDomainCited: boolean;
  allDomains: string[];
  promptsUsingQuery: string[];
  totalCitations: number;
}
