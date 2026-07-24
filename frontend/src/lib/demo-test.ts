import type {
  GeneratedPrompt,
  SubQueryResult,
  TopicResult,
  WebsiteAnalysis,
} from "@/lib/types";

/** Free sandbox domain — colorful filled globe mark */
export const DEMO_DOMAIN = "test.com";
export const DEMO_ICON_SRC = "/demo-globe.svg";

/** Known-brand pills + demo — skip Gemini / ChatGPT entirely */
export const CANNED_DOMAINS = [
  DEMO_DOMAIN,
  "clickup.com",
  "notion.so",
  "figma.com",
] as const;

export type CannedDomain = (typeof CANNED_DOMAINS)[number];

/** Keep the loading glow on screen long enough to enjoy */
export const CANNED_ANALYSIS_MIN_MS = 9000;
export const CANNED_PROMPTS_MIN_MS = 700;

/** @deprecated use CANNED_ANALYSIS_MIN_MS */
export const DEMO_ANALYSIS_MIN_MS = CANNED_ANALYSIS_MIN_MS;
/** @deprecated use CANNED_PROMPTS_MIN_MS */
export const DEMO_PROMPTS_MIN_MS = CANNED_PROMPTS_MIN_MS;

export function normalizeHost(raw: string): string {
  return raw
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .split("/")[0]
    .toLowerCase();
}

export function isDemoDomain(raw: string): boolean {
  return normalizeHost(raw) === DEMO_DOMAIN;
}

export function isCannedDomain(raw: string): boolean {
  return (CANNED_DOMAINS as readonly string[]).includes(normalizeHost(raw));
}

export function brandIconUrl(domain: string, size: 32 | 64 | 128 = 64): string {
  if (isDemoDomain(domain)) return DEMO_ICON_SRC;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export type CannedSiteMeta = {
  domain: string;
  url: string;
  title: string;
  description: string | null;
  image: string | null;
};

type CannedTopicSpec = {
  category: string;
  /** Parent monitor prompt + real fan-out searches */
  queries: [string, string, string, string, string];
  statuses: [
    SubQueryResult["status"],
    SubQueryResult["status"],
    SubQueryResult["status"],
    SubQueryResult["status"],
    SubQueryResult["status"],
  ];
};

type CannedPack = {
  meta: CannedSiteMeta;
  prompts: GeneratedPrompt[];
  competitors: string[];
  topics: CannedTopicSpec[];
};

function packFrom(
  meta: CannedSiteMeta,
  competitors: string[],
  topics: CannedTopicSpec[]
): CannedPack {
  const cats = topics.map((t) => t.category);
  const prompts: GeneratedPrompt[] = topics.map((t, i) => ({
    id: String(i + 1),
    prompt: t.queries[0],
    category: cats[i] || "General",
    selected: true,
    queries: [...t.queries],
  }));
  return { meta, prompts, competitors, topics };
}

const CANNED: Record<CannedDomain, CannedPack> = {
  "test.com": packFrom(
    {
      domain: DEMO_DOMAIN,
      url: `https://${DEMO_DOMAIN}`,
      title: "Test Co — Demo product",
      description:
        "Example SaaS used for free UI testing. No live AI searches are run.",
      image: null,
    },
    [
      "asana.com",
      "monday.com",
      "clickup.com",
      "notion.so",
      "linear.app",
      "trello.com",
    ],
    [
      {
        category: "What",
        queries: [
          "What is the best project management tool for startups?",
          "Best PM software for early-stage startups",
          "Startup project tracking tools comparison",
          "Lightweight project management for founders",
          "Which project management apps do YC companies use?",
        ],
        statuses: ["cited", "cited", "missing", "retrieved", "missing"],
      },
      {
        category: "How",
        queries: [
          "How do I organize tasks for a remote team?",
          "Remote team task management workflows",
          "How to run async standups with software",
          "Tools for distributed product teams",
          "Best practices for remote project management",
        ],
        statuses: ["cited", "missing", "retrieved", "cited", "missing"],
      },
      {
        category: "Best",
        queries: [
          "Best task management apps for small teams",
          "Simple kanban tools for 10 person teams",
          "Affordable project management software 2026",
          "Best PM apps under $15 per user",
          "Top task trackers for small businesses",
        ],
        statuses: ["missing", "cited", "retrieved", "missing", "cited"],
      },
      {
        category: "Alternatives",
        queries: [
          "Asana alternatives for product teams",
          "Tools like Asana for product ops",
          "Asana vs lighter project management tools",
          "Switch from Asana to another PM tool",
          "Best Asana replacements for startups",
        ],
        statuses: ["cited", "cited", "missing", "retrieved", "missing"],
      },
      {
        category: "How",
        queries: [
          "How can I track projects across engineering and design?",
          "Cross-functional project visibility tools",
          "Shared roadmap software for eng and design",
          "How PMs track design and engineering work",
          "Unified backlog tools for product teams",
        ],
        statuses: ["retrieved", "cited", "missing", "cited", "missing"],
      },
    ]
  ),
  "clickup.com": packFrom(
    {
      domain: "clickup.com",
      url: "https://clickup.com",
      title: "ClickUp — One app to replace them all",
      description:
        "Project management, docs, goals, and chat for productive teams.",
      image: null,
    },
    [
      "asana.com",
      "monday.com",
      "notion.so",
      "linear.app",
      "jira.atlassian.com",
      "basecamp.com",
    ],
    [
      {
        category: "What",
        queries: [
          "What is the best project management software for startups?",
          "Best all-in-one PM tools for startups",
          "ClickUp vs Asana for growing teams",
          "Project management platforms with docs and chat",
          "Which PM tool replaces multiple apps?",
        ],
        statuses: ["cited", "cited", "missing", "retrieved", "cited"],
      },
      {
        category: "How",
        queries: [
          "How do I organize tasks for a remote team?",
          "Remote team task workflows in ClickUp",
          "How to manage sprints and docs in one tool",
          "Tools for distributed product and eng teams",
          "How to set up goals and tasks for remote work",
        ],
        statuses: ["cited", "missing", "retrieved", "cited", "missing"],
      },
      {
        category: "Best",
        queries: [
          "Best all-in-one productivity apps for small teams",
          "Best work OS platforms for startups",
          "Top project management suites 2026",
          "Best tools that combine tasks docs and chat",
          "Highest rated PM software for small businesses",
        ],
        statuses: ["missing", "cited", "retrieved", "cited", "missing"],
      },
      {
        category: "Alternatives",
        queries: [
          "Asana alternatives for growing companies",
          "Monday.com alternatives for product teams",
          "Jira alternatives that are easier to use",
          "Best replacements for Asana and Trello",
          "All-in-one alternatives to Notion and Asana",
        ],
        statuses: ["cited", "cited", "missing", "retrieved", "cited"],
      },
      {
        category: "How",
        queries: [
          "How can I track projects across engineering and design?",
          "Cross-team roadmaps in project management tools",
          "How to connect design tasks to engineering tickets",
          "Shared backlog software for product teams",
          "How PMs track work across multiple departments",
        ],
        statuses: ["retrieved", "cited", "missing", "cited", "missing"],
      },
    ]
  ),
  "notion.so": packFrom(
    {
      domain: "notion.so",
      url: "https://notion.so",
      title: "Notion — Your connected workspace",
      description: "Notes, docs, wikis, and projects in one place.",
      image: null,
    },
    [
      "evernote.com",
      "coda.io",
      "confluence.atlassian.com",
      "obsidian.md",
      "clickup.com",
      "slack.com",
    ],
    [
      {
        category: "What",
        queries: [
          "What is the best note taking software for teams?",
          "Best collaborative notebooks for companies",
          "Notion vs Evernote for team notes",
          "Shared note taking apps for startups",
          "Which workspace tools work as a company wiki?",
        ],
        statuses: ["cited", "cited", "missing", "retrieved", "cited"],
      },
      {
        category: "How",
        queries: [
          "How can I organize my company knowledge?",
          "How to build an internal knowledge base",
          "Tools to organize team documentation",
          "How to keep SOPs and notes in one place",
          "Best ways to structure a company wiki",
        ],
        statuses: ["cited", "missing", "retrieved", "cited", "missing"],
      },
      {
        category: "Best",
        queries: [
          "Best wiki tools for remote teams",
          "Best knowledge base software for startups",
          "Top documentation tools for remote companies",
          "Best connected workspace apps 2026",
          "Highest rated team wiki platforms",
        ],
        statuses: ["missing", "cited", "retrieved", "cited", "missing"],
      },
      {
        category: "Alternatives",
        queries: [
          "Evernote alternatives for knowledge bases",
          "Confluence alternatives for startups",
          "Coda vs Notion for docs and databases",
          "Best replacements for Google Docs and wikis",
          "Obsidian alternatives for teams",
        ],
        statuses: ["cited", "cited", "missing", "retrieved", "cited"],
      },
      {
        category: "How",
        queries: [
          "How do I keep team docs in one place?",
          "How to centralize company documentation",
          "Tools for shared docs across departments",
          "How product teams manage specs and notes",
          "Best practices for a single source of truth wiki",
        ],
        statuses: ["retrieved", "cited", "missing", "cited", "missing"],
      },
    ]
  ),
  "figma.com": packFrom(
    {
      domain: "figma.com",
      url: "https://figma.com",
      title: "Figma — Collaborative interface design",
      description: "Design, prototype, and collaborate in the browser.",
      image: null,
    },
    [
      "sketch.com",
      "adobe.com",
      "framer.com",
      "canva.com",
      "invisionapp.com",
      "miro.com",
    ],
    [
      {
        category: "What",
        queries: [
          "What is the best UI design tool for product teams?",
          "Best collaborative design software for startups",
          "Figma vs Sketch for interface design",
          "Browser-based UI design tools comparison",
          "Which design tools do product teams use in 2026?",
        ],
        statuses: ["cited", "cited", "missing", "retrieved", "cited"],
      },
      {
        category: "How",
        queries: [
          "How do designers collaborate on the same file?",
          "How to co-edit UI designs in real time",
          "Multiplayer design tools for remote teams",
          "How design teams share feedback on mockups",
          "Best ways to collaborate on product UI",
        ],
        statuses: ["cited", "missing", "retrieved", "cited", "missing"],
      },
      {
        category: "Best",
        queries: [
          "Best prototyping tools for startups",
          "Best tools for interactive UI prototypes",
          "Top design-to-prototype platforms 2026",
          "Best free prototyping software for product teams",
          "Highest rated UI prototyping apps",
        ],
        statuses: ["missing", "cited", "retrieved", "cited", "missing"],
      },
      {
        category: "Alternatives",
        queries: [
          "Sketch alternatives for interface design",
          "Adobe XD alternatives for UI design",
          "Framer vs Figma for prototyping",
          "Best replacements for Sketch and InVision",
          "Canva alternatives for product UI design",
        ],
        statuses: ["cited", "cited", "missing", "retrieved", "cited"],
      },
      {
        category: "How",
        queries: [
          "How can I hand off designs to engineers?",
          "Design handoff tools for developers",
          "How to export specs and assets for engineering",
          "Best workflows from Figma to production",
          "How PMs and engineers review design files",
        ],
        statuses: ["retrieved", "cited", "missing", "cited", "missing"],
      },
    ]
  ),
};

/** @deprecated use getCannedExample(DEMO_DOMAIN).prompts */
export const DEMO_PROMPTS = CANNED["test.com"].prompts;
/** @deprecated use getCannedExample(DEMO_DOMAIN).meta */
export const DEMO_SITE_META = CANNED["test.com"].meta;

export function getCannedExample(raw: string): CannedPack | null {
  const host = normalizeHost(raw);
  if (!(CANNED_DOMAINS as readonly string[]).includes(host)) return null;
  return CANNED[host as CannedDomain];
}

function sq(
  you: string,
  query: string,
  status: SubQueryResult["status"],
  domains: string[],
  opts?: { rank?: number | null; winner?: string | null }
): SubQueryResult {
  const cited = status === "cited";
  const retrieved = status === "cited" || status === "retrieved";
  return {
    query,
    status,
    retrieved,
    cited,
    rank: opts?.rank ?? (cited ? 2 : null),
    avg_rank: opts?.rank ?? (cited ? 2 : null),
    total_citations: domains.length,
    total_sources: Math.max(domains.length, 3),
    all_domains: domains,
    sources: domains.map((d) => ({
      domain: d,
      url: `https://${d}`,
      title: d,
      is_you: d.toLowerCase() === you.toLowerCase(),
    })),
    winner: opts?.winner ?? domains[0] ?? null,
    matched_as: cited ? you : null,
  };
}

function topic(
  prompt: string,
  category: string,
  sub_queries: SubQueryResult[]
): TopicResult {
  const cited_count = sub_queries.filter((s) => s.cited).length;
  const retrieved_count = sub_queries.filter((s) => s.retrieved).length;
  const missing_count = sub_queries.filter((s) => s.status === "missing").length;
  const n = sub_queries.length || 1;
  return {
    prompt,
    category,
    sub_query_count: sub_queries.length,
    citation_rate: cited_count / n,
    presence_rate: retrieved_count / n,
    cited_count,
    retrieved_count,
    missing_count,
    sub_queries,
  };
}

function domainsForStatus(
  you: string,
  rivals: string[],
  status: SubQueryResult["status"],
  i: number
): string[] {
  const r = (n: number) => rivals[n % rivals.length];
  if (status === "cited") {
    return i % 2 === 0
      ? [you, r(i), r(i + 1), r(i + 2)]
      : [r(i), you, r(i + 1)];
  }
  if (status === "retrieved") return [r(i), you, r(i + 2)];
  return [r(i), r(i + 1)];
}

/** Rich canned dashboard payload — never hits paid APIs. */
export function buildCannedAnalysis(
  domain: string,
  prompts?: GeneratedPrompt[]
): WebsiteAnalysis {
  const host = normalizeHost(domain);
  const pack = getCannedExample(host) || CANNED["test.com"];
  const you = pack.meta.domain;
  const selected = (prompts || pack.prompts)
    .map((p) => ({ ...p, prompt: p.prompt.trim() }))
    .filter((p) => p.prompt.length > 0);

  const topics: TopicResult[] = selected.map((p, i) => {
    const spec = pack.topics[i] || pack.topics[pack.topics.length - 1];
    // Keep real fan-outs; swap the parent query for any user edit
    const queries = [...spec.queries] as string[];
    queries[0] = p.prompt;
    const sub_queries = queries.map((query, j) => {
      const status = spec.statuses[j] || "missing";
      const domains = domainsForStatus(you, pack.competitors, status, j + i);
      return sq(you, query, status, domains, {
        rank: status === "cited" ? (j === 0 ? 1 : 2) : null,
        winner: status === "cited" ? you : domains[0] || null,
      });
    });
    return topic(p.prompt, spec.category, sub_queries);
  });

  const sample_size = topics.reduce((n, t) => n + t.sub_query_count, 0);
  const cited_count = topics.reduce((n, t) => n + t.cited_count, 0);
  const retrieved_count = topics.reduce((n, t) => n + t.retrieved_count, 0);
  const missing_count = topics.reduce((n, t) => n + t.missing_count, 0);
  const citation_rate = sample_size ? cited_count / sample_size : 0;

  const competitorHits = new Map<string, number>();
  for (const t of topics) {
    for (const s of t.sub_queries) {
      for (const d of s.all_domains) {
        const key = d.toLowerCase();
        competitorHits.set(key, (competitorHits.get(key) || 0) + 1);
      }
    }
  }
  const competitors = [...competitorHits.entries()]
    .map(([d, citations]) => ({
      domain: d,
      citations,
      presence: citations,
      share_of_voice: sample_size ? citations / sample_size : 0,
    }))
    .sort((a, b) => b.citations - a.citations)
    .slice(0, 8);

  return {
    url: pack.meta.url,
    domain: you,
    visibility: {
      normalized_domain: you,
      domain_suggestion: null,
      visibility_score: Math.round(citation_rate * 100),
      verdict: citation_rate >= 0.4 ? "moderate" : "low",
      verdict_label: "Sample data",
      verdict_summary: "Example visibility report (no live AI searches).",
      verdict_blurb:
        "Hard-coded example searches for UI testing. Other domains still call paid APIs.",
      kpis: {
        citation_rate,
        presence_rate: sample_size ? retrieved_count / sample_size : 0,
        avg_rank: 2.4,
        share_of_voice: citation_rate * 0.85,
        sample_size,
        cited_count,
        retrieved_count,
        missing_count,
        topic_count: topics.length,
      },
      topics,
      competitors,
      recommendations: [],
      top_competitor: competitors.find((c) => c.domain !== you) || null,
    },
    totalQueries: sample_size,
    averageRanking: 2.4,
    overallVisibility: citation_rate,
    topCategory: "Sample",
  };
}

/** @deprecated use buildCannedAnalysis */
export function buildDemoAnalysis(
  prompts: GeneratedPrompt[] = DEMO_PROMPTS
): WebsiteAnalysis {
  return buildCannedAnalysis(DEMO_DOMAIN, prompts);
}
