import { GeneratedPrompt } from "@/lib/types";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const CACHE_DIR = path.join(process.cwd(), ".cache", "prompts");
const CACHE_EXPIRY_HOURS = 24;
/** Realistic category buyer questions (Notion=notes, PromptWatch=AI search, etc.). */
export const PROMPT_CACHE_VERSION = "v18-buyer-questions";
const TARGET_COUNT = 5;
const MAX_WORDS = 22;
const MIN_WORDS = 5;
const META_TIMEOUT_MS = 5000;
const GEMINI_TIMEOUT_MS = 12000;

const TOO_GENERIC = [
  /^best (ai |saas |online |software )?tools?$/i,
  /^best tools?$/i,
  /^cheap tools?$/i,
  /^do i need (a |an )?(ai |saas )?tools?$/i,
  /^saas tools?( comparison| alternatives)?$/i,
  /^how to choose (ai |saas )?tools?$/i,
  /^best (software|saas|online)?\s*(solutions?|platforms?|tools?) for (new )?startups?$/i,
  /^which (software|tools?|platforms?) (works?|are) best for startups?$/i,
  /^best (software|saas) (solutions?|tools?) for (a )?(small business|companies|teams)$/i,
  /^(top|best) (software|saas) solutions?\b/i,
  /^software (tools?|solutions?) for (startups?|businesses)$/i,
  /\balternatives?\s+to\s+(semrush|ahrefs|moz|hubspot|salesforce|similarweb|google analytics)\b/i,
];

/** AI-visibility phrasing — only valid when the site IS an AI-visibility product. */
const AI_VISIBILITY_PROMPT =
  /\b(ai search|geo\b|generative engine|chatgpt|perplexity|llm (brand|rank|mention)|brand mentions? in (ai|chatgpt|perplexity)|ai visibility|prompt.?watch)\b/i;

const BROAD_ONLY = /\b(software|saas|platform|solution|tool|app|product)s?\b/i;
const SPECIFIC_SIGNAL =
  /\b(note[- ]?tak|wiki|docs?|knowledge base|payment|checkout|billing|crm|seo|analytics|email|newsletter|design|figma|hosting|devops|visibility|geo|citation|project|task|kanban|productivity|work.?os|spreadsheet|database|auth|invoice|accounting|hr|recruit|support|chat|video|meeting|calendar|storage|cdn|cms|e-?commerce|shopify|stripe|notion|slack|asana|monday\.com|trello|jira|chatgpt|perplexity|brand mention|prompt|workflow|roadmap|sprint|issue track|insurance|claims?|agentic|ai agents?|underwrit|mga|broker)\b/i;

const PROJECT_MGMT_PROMPT =
  /\b(project management|productivity apps?|monday\.com|asana|task tracking|work across tasks docs)\b/i;

type SiteSignals = {
  title: string;
  description: string;
  ogTitle: string;
  headings: string[];
  bodySnippet: string;
};

function generateCacheKey(url: string): string {
  return crypto
    .createHash("md5")
    .update(`${PROMPT_CACHE_VERSION}|${url}`)
    .digest("hex");
}

async function readFromCache(url: string): Promise<GeneratedPrompt[] | null> {
  try {
    const cacheFilePath = path.join(CACHE_DIR, `${generateCacheKey(url)}.json`);
    const stats = await fs.stat(cacheFilePath);
    const hoursDiff =
      (Date.now() - new Date(stats.mtime).getTime()) / (1000 * 60 * 60);
    if (hoursDiff > CACHE_EXPIRY_HOURS) return null;
    const cachedResult = JSON.parse(await fs.readFile(cacheFilePath, "utf-8"));
    return cachedResult.prompts as GeneratedPrompt[];
  } catch {
    return null;
  }
}

async function writeToCache(
  url: string,
  prompts: GeneratedPrompt[]
): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const cacheFilePath = path.join(CACHE_DIR, `${generateCacheKey(url)}.json`);
    await fs.writeFile(
      cacheFilePath,
      JSON.stringify(
        {
          url,
          version: PROMPT_CACHE_VERSION,
          timestamp: new Date().toISOString(),
          prompts,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(`Failed to write prompt cache for ${url}:`, error);
  }
}

function decodeEntities(raw: string): string {
  return raw
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
    .replace(/[\u0000-\u001F\u007F-\u009F\uFFFD\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fetch title, description, headings, and a short body snippet for category fit. */
async function fetchSiteSignals(rawUrl: string): Promise<SiteSignals> {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  const empty: SiteSignals = {
    title: "",
    description: "",
    ogTitle: "",
    headings: [],
    bodySnippet: "",
  };
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VizionBot/1.0; +https://localhost)",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(META_TIMEOUT_MS),
    });
    if (!response.ok) return empty;

    const reader = response.body?.getReader();
    let html = "";
    if (!reader) {
      html = (await response.text()).slice(0, 120_000);
    } else {
      const decoder = new TextDecoder();
      while (html.length < 120_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        // Prefer stopping once head meta is available (Framer sites are huge)
        if (/<\/head>/i.test(html) && /<title[\s>]/i.test(html)) break;
        if (html.length > 80_000 && /<\/h[1-3]>/i.test(html)) break;
      }
      reader.cancel().catch(() => {});
    }
    return parseSiteSignals(html);
  } catch {
    return empty;
  }
}

function parseSiteSignals(html: string): SiteSignals {
  const title = decodeEntities(
    html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim().slice(0, 140) || ""
  );
  const description = decodeEntities(
    html
      .match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
      )?.[1]
      ?.trim()
      .slice(0, 320) ||
      html
        .match(
          /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i
        )?.[1]
        ?.trim()
        .slice(0, 320) ||
      html
        .match(
          /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i
        )?.[1]
        ?.trim()
        .slice(0, 320) ||
      ""
  );
  const ogTitle = decodeEntities(
    html
      .match(
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i
      )?.[1]
      ?.trim()
      .slice(0, 140) || ""
  );

  const headings: string[] = [];
  const headingRe = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let hm: RegExpExecArray | null;
  while ((hm = headingRe.exec(html)) !== null && headings.length < 10) {
    const text = decodeEntities(hm[2].replace(/<[^>]+>/g, " "));
    if (text.length >= 3 && text.length <= 120) headings.push(text);
  }

  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  const bodySnippet = decodeEntities(stripped).slice(0, 900);

  return { title, description, ogTitle, headings, bodySnippet };
}

function brandTokensFromUrl(url: string): string[] {
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`)
      .hostname.replace(/^www\./, "")
      .toLowerCase();
    const label = host.split(".")[0] || "";
    return [host, label, label.replace(/-/g, " ")].filter((t) => t.length >= 3);
  } catch {
    return [];
  }
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizePromptText(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .trim()
    .replace(/\?+$/, "");
}

export function isValidBuyerPrompt(
  prompt: string,
  brandTokens: string[],
  options?: { allowAiVisibility?: boolean; allowProjectManagement?: boolean }
): boolean {
  const t = normalizePromptText(prompt);
  if (!t) return false;
  const words = wordCount(t);
  if (words < MIN_WORDS || words > MAX_WORDS) return false;
  if (t.length > 220) return false;
  if (/[;|]/.test(t)) return false;
  const lower = t.toLowerCase();
  if (brandTokens.some((tok) => tok && lower.includes(tok))) return false;
  if (TOO_GENERIC.some((re) => re.test(t))) return false;
  if (!options?.allowAiVisibility && AI_VISIBILITY_PROMPT.test(t)) {
    return false;
  }
  if (!options?.allowProjectManagement && PROJECT_MGMT_PROMPT.test(t)) {
    return false;
  }
  if (
    /\b(enterprise[- ]grade|omnichannel|stakeholders|kpi framework|synerg)\b/i.test(
      t
    )
  ) {
    return false;
  }
  const hasSpecific = SPECIFIC_SIGNAL.test(t);
  const onlyBroad =
    BROAD_ONLY.test(t) &&
    !hasSpecific &&
    /\b(startup|business|company|team|enterprise)s?\b/i.test(t);
  if (onlyBroad) return false;
  return true;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let candidate = (fenced ? fenced[1] : text).trim();
  const match = candidate.match(/\{[\s\S]*\}/);
  if (match) candidate = match[0];
  candidate = candidate
    .replace(/,\s*([\]}])/g, "$1")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
  try {
    return JSON.parse(candidate);
  } catch {
    const prompts: GeminiPromptRow[] = [];
    const re = /"prompt"\s*:\s*"((?:\\.|[^"\\])*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      prompts.push({
        prompt: m[1].replace(/\\"/g, '"').replace(/\\n/g, " "),
        category: "General",
      });
    }
    if (prompts.length) return { prompts };
    throw new Error("Could not parse Gemini JSON");
  }
}

type GeminiPromptRow = { prompt?: string; category?: string };

/** Well-known domains → product category (beats flaky title parsing). */
const DOMAIN_CATEGORY: Array<[RegExp, string]> = [
  [/clickup\.com|asana\.com|monday\.com|linear\.app|basecamp\.com|jira|atlassian\.com|trello\.com|wrike\.com|smartsheet\.com|height\.app|shortcut\.com/, "project management"],
  [/notion\.so|coda\.io|evernote\.com|obsidian\.md|roamresearch/, "note-taking"],
  [/stripe\.com|paddle\.com|braintree|adyen\.com|square\.com/, "payment"],
  [/hubspot\.com|salesforce\.com|pipedrive\.com|close\.com|attio\.com/, "CRM"],
  [/mailchimp\.com|klaviyo\.com|convertkit\.com|beehiiv\.com|substack\.com/, "email marketing"],
  [/figma\.com|canva\.com|sketch\.com|framer\.com/, "design"],
  [/ahrefs\.com|semrush\.com|moz\.com|surfer\.com/, "SEO"],
  [/promptwatch|peec\.ai|otterly|goodie\.ai|rankscale|athena.?hq/, "AI visibility"],
];

function signalBlob(url: string, signals: SiteSignals): string {
  return [
    url,
    signals.title,
    signals.ogTitle,
    signals.description,
    signals.headings.join(" "),
    signals.bodySnippet.slice(0, 500),
  ]
    .join(" ")
    .toLowerCase();
}

function heuristicCategory(url: string, signals: SiteSignals): string {
  const host = (() => {
    try {
      return new URL(url.startsWith("http") ? url : `https://${url}`).hostname
        .replace(/^www\./, "")
        .toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();

  for (const [re, cat] of DOMAIN_CATEGORY) {
    if (re.test(host) || re.test(url.toLowerCase())) return cat;
  }

  const blob = signalBlob(url, signals);
  const rules: Array<[RegExp, string]> = [
    [
      /\b(prompt.?watch|peec\.ai|generative engine optimization|\bgeo\b|llm.?monitor|brand.?mention|ai search visibility)\b/,
      "AI visibility",
    ],
    [
      /\b(insurance|claims? processing|claims? agent|mga|tpa|policyholder|loss adjust)\b/,
      "insurance claims AI",
    ],
    [
      /\b(agentic ai|ai agents?|autonomous agents?|llm agents?)\b/,
      "AI agents",
    ],
    [
      /\b(project management|task management|work os|kanban board|sprint planning|issue track)\b/,
      "project management",
    ],
    [
      /\b(note.?tak|wiki|knowledge.?base|team docs|second brain)\b/,
      "note-taking",
    ],
    [/\b(payment|checkout|billing|invoice|subscription billing)\b/, "payment"],
    [/\b(seo|search.?engine|backlink|keyword research)\b/, "SEO"],
    [/\b(crm|sales.?pipeline|deal pipeline)\b/, "CRM"],
    [/\b(email.?market|newsletter|drip campaign)\b/, "email marketing"],
    [/\b(analytics|bi dashboard|product analytics)\b/, "analytics"],
    [/\b(ui design|product design|prototyping|figma)\b/, "design"],
    [/\b(hosting|cloud infra|devops|vercel|aws)\b/, "cloud"],
  ];
  for (const [re, cat] of rules) {
    if (re.test(blob)) return cat;
  }

  // "Brand | Specific category" / "Brand - Specific category"
  const titled = `${signals.ogTitle || ""} ${signals.title || ""}`.trim();
  if (titled) {
    const parts = titled
      .split(/\s*[|\u2013\u2014•·:]\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
    const brand = brandTokensFromUrl(url);
    const niche = parts.find((p) => {
      const lower = p.toLowerCase();
      if (brand.some((tok) => tok && lower.includes(tok))) return false;
      return p.split(/\s+/).length >= 2 && p.length >= 8 && p.length <= 60;
    });
    if (niche) return niche.toLowerCase();
  }

  // Phrase from description — never use the brand/domain label alone
  const brand = brandTokensFromUrl(url);
  const fromDesc = signals.description
    .split(/[.|•·]/)
    .map((s) => s.trim())
    .find((s) => {
      const lower = s.toLowerCase();
      if (s.length < 12 || s.split(/\s+/).length > 14) return false;
      if (brand.some((tok) => tok && lower.includes(tok))) return false;
      return true;
    });
  if (fromDesc) {
    const clipped = fromDesc
      .replace(/\b(the|our|we|a|an)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (clipped.length >= 8 && clipped.length <= 64) return clipped;
  }

  return "specialized software";
}

function isAiVisibilityCategory(category: string): boolean {
  return /\b(ai visibility|geo|llm monitor|brand mention)\b/i.test(category);
}

function isProjectManagementCategory(category: string): boolean {
  return /\b(project management|productivity|task management|work os)\b/i.test(
    category
  );
}

/** Build content-native seed prompts from title/description when Gemini fails. */
function contentSeedPrompts(
  category: string,
  signals: SiteSignals
): GeneratedPrompt[] {
  const niche =
    category.trim().toLowerCase() ||
    signals.description.split(/[.|]/)[0]?.trim().toLowerCase() ||
    "specialized software";

  function pack(list: string[]): GeneratedPrompt[] {
    const cats = ["What", "How", "Best", "How", "Alternatives"];
    return list.map((prompt, i) => ({
      id: String(i + 1),
      prompt,
      category: cats[i] || "General",
      selected: true,
      queries: [prompt],
    }));
  }

  const blob = `${signals.title} ${signals.description} ${category}`.toLowerCase();
  if (/\binsurance\b|\bclaims?\b/.test(blob)) {
    return pack([
      "best AI tools for insurance claims processing",
      "how do I automate insurance claims with AI",
      "what is the best AI claims agent for insurers",
      "how can I reduce claim handling time with AI",
      "AI alternatives for manual insurance claims review",
    ]);
  }
  if (
    /\b(ai visibility|geo|brand mention|chatgpt|perplexity|prompt.?watch|peec)\b/.test(
      blob
    )
  ) {
    return pack([
      "how can I optimize my brand for AI search",
      "how do I get mentioned in ChatGPT answers",
      "best tools to track AI search visibility",
      "how can I be recommended by AI search engines",
      "what is the best way to monitor brand mentions in AI",
    ]);
  }
  if (/\b(note|wiki|knowledge|docs workspace|documentation)\b/.test(blob)) {
    return pack([
      "what is the best note taking software for teams",
      "how can I organize my company knowledge",
      "best wiki tools for remote teams",
      "how do I keep team docs in one place",
      "Evernote alternatives for knowledge bases",
    ]);
  }
  if (/\b(project management|task management|kanban)\b/.test(blob)) {
    return pack([
      "what is the best project management software for startups",
      "how do I organize tasks for a remote team",
      "best task management apps for small teams",
      "Asana alternatives for product teams",
      "how can I track projects across engineering and design",
    ]);
  }

  return pack([
    `what is the best ${niche} for teams`,
    `how do I get better results with ${niche}`,
    `best tools for ${niche}`,
    `how can I choose a ${niche} solution`,
    `${niche} alternatives for growing companies`,
  ]);
}

/** Category-aware fallbacks when Gemini fails. */
function fillTemplates(category: string): GeneratedPrompt[] {
  let c = category.trim().toLowerCase() || "specialized software";
  if (
    c === "this product" ||
    c === "product" ||
    c === "software" ||
    c === "productivity software"
  ) {
    c = "specialized software";
  }

  const banks: Record<string, Array<{ prompt: string; category: string }>> = {
    "ai visibility": [
      {
        prompt: "how can I optimize my brand for AI search",
        category: "How",
      },
      {
        prompt: "how do I get mentioned in ChatGPT answers",
        category: "How",
      },
      {
        prompt: "best tools to track AI search visibility",
        category: "Best",
      },
      {
        prompt: "how can I be recommended by AI search engines",
        category: "How",
      },
      {
        prompt: "what is the best way to monitor brand mentions in AI",
        category: "What",
      },
    ],
    "insurance claims ai": [
      {
        prompt: "best AI tools for insurance claims processing",
        category: "Best",
      },
      {
        prompt: "how do I automate insurance claims with AI agents",
        category: "How",
      },
      {
        prompt: "what is the best AI claims agent for insurers and MGAs",
        category: "What",
      },
      {
        prompt: "AI alternatives for manual insurance claims review",
        category: "Alternatives",
      },
      {
        prompt: "how to reduce claim handling time with AI",
        category: "How",
      },
    ],
    "ai agents": [
      {
        prompt: "best AI agent platforms for business workflows",
        category: "Best",
      },
      {
        prompt: "how do I deploy AI agents for back office work",
        category: "How",
      },
      {
        prompt: "what is the best agentic AI tool for operations teams",
        category: "What",
      },
      {
        prompt: "alternatives to building custom LLM agents in house",
        category: "Alternatives",
      },
      {
        prompt: "how to use AI agents to automate document heavy processes",
        category: "How",
      },
    ],
    "project management": [
      {
        prompt: "best project management tools for startups",
        category: "Best",
      },
      {
        prompt: "how do I organize tasks and projects for a remote team",
        category: "How",
      },
      {
        prompt: "what is the best task management app for small teams",
        category: "What",
      },
      {
        prompt: "Asana alternatives for project and task tracking",
        category: "Alternatives",
      },
      {
        prompt: "best productivity software for cross functional teams",
        category: "Best",
      },
    ],
    "productivity software": [
      {
        prompt: "best productivity apps for startups",
        category: "Best",
      },
      {
        prompt: "how do I manage work across tasks docs and goals",
        category: "How",
      },
      {
        prompt: "what is the best all in one work platform for teams",
        category: "What",
      },
      {
        prompt: "Monday.com alternatives for project tracking",
        category: "Alternatives",
      },
      {
        prompt: "best tools for team productivity and task tracking",
        category: "Best",
      },
    ],
    payment: [
      {
        prompt: "best payment processors for SaaS startups",
        category: "Best",
      },
      {
        prompt: "how do I set up online payments for my product",
        category: "How",
      },
      {
        prompt: "what is the best Stripe alternative for subscriptions",
        category: "What",
      },
      {
        prompt: "cheapest way to accept card payments online",
        category: "Best",
      },
      {
        prompt: "how to choose a payment gateway for a small business",
        category: "How",
      },
    ],
    seo: [
      {
        prompt: "how do I optimize my website for SEO",
        category: "How",
      },
      {
        prompt: "best SEO tools for startups",
        category: "Best",
      },
      {
        prompt: "what is the best way to track keyword rankings",
        category: "What",
      },
      {
        prompt: "Ahrefs alternatives for small teams",
        category: "Alternatives",
      },
      {
        prompt: "how to find content gaps for SEO",
        category: "How",
      },
    ],
    design: [
      {
        prompt: "best product design agencies for startups",
        category: "Best",
      },
      {
        prompt: "how do I redesign a SaaS app without hiring full-time",
        category: "How",
      },
      {
        prompt: "what is the best way to find a branding and web design partner",
        category: "What",
      },
      {
        prompt: "alternatives to hiring an in-house design team",
        category: "Alternatives",
      },
      {
        prompt: "best tools for UI design and prototyping",
        category: "Best",
      },
    ],
    "note-taking": [
      {
        prompt: "what is the best note taking software for teams",
        category: "What",
      },
      {
        prompt: "how can I organize my company knowledge",
        category: "How",
      },
      {
        prompt: "best wiki tools for remote teams",
        category: "Best",
      },
      {
        prompt: "how do I keep team docs in one place",
        category: "How",
      },
      {
        prompt: "Evernote alternatives for knowledge bases",
        category: "Alternatives",
      },
    ],
    crm: [
      {
        prompt: "best CRM tools for startups",
        category: "Best",
      },
      {
        prompt: "how do I track a sales pipeline for a small team",
        category: "How",
      },
      {
        prompt: "what is the best CRM for early stage companies",
        category: "What",
      },
      {
        prompt: "HubSpot alternatives for small sales teams",
        category: "Alternatives",
      },
      {
        prompt: "best tools for managing customer relationships",
        category: "Best",
      },
    ],
    "email marketing": [
      {
        prompt: "best email marketing tools for startups",
        category: "Best",
      },
      {
        prompt: "how do I grow an email newsletter from scratch",
        category: "How",
      },
      {
        prompt: "what is the best platform for automated email campaigns",
        category: "What",
      },
      {
        prompt: "Mailchimp alternatives for creators",
        category: "Alternatives",
      },
      {
        prompt: "best tools for email newsletters and drips",
        category: "Best",
      },
    ],
  };

  const bankKey = Object.keys(banks).find((k) => c.includes(k) || k.includes(c));
  if (bankKey) {
    return banks[bankKey].map((s, i) => ({
      id: String(i + 1),
      prompt: s.prompt,
      category: s.category,
      selected: true,
      queries: [s.prompt],
    }));
  }

  // Unknown niche: synthesize from the category phrase — never dump PM templates
  const seeds = [
    { prompt: `best ${c} tools for companies`, category: "Best" },
    { prompt: `how do I choose a ${c} solution`, category: "How" },
    { prompt: `what is the best ${c} platform for teams`, category: "What" },
    { prompt: `${c} alternatives for growing teams`, category: "Alternatives" },
    { prompt: `how to get better results with ${c}`, category: "How" },
  ];

  return seeds.map((s, i) => ({
    id: String(i + 1),
    prompt: s.prompt,
    category: s.category,
    selected: true,
    queries: [s.prompt],
  }));
}

/**
 * One Gemini call: infer what the product does, then write fitting buyer questions.
 */
async function askGeminiForProductPrompts(args: {
  apiKey: string;
  url: string;
  signals: SiteSignals;
  categoryHint: string;
  brandTokens: string[];
}): Promise<GeminiPromptRow[]> {
  const { apiKey, url, signals, categoryHint, brandTokens } = args;
  const brandHint = brandTokens[1] || "the brand";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const system = `You write the questions real buyers type into ChatGPT / Perplexity / Gemini when shopping a product category.

Goal: category-intent questions (NOT brand-name questions). Infer what the product IS, then ask like a buyer who does not know this brand yet.

CRITICAL:
1. Category hint: "${categoryHint}"
2. Every prompt must be a natural question or comparison about THAT category / job-to-be-done
3. Unbranded: never use "${brandHint}" or the domain
4. NEVER invent an unrelated niche (e.g. do not suggest productivity apps for an insurance AI product)
5. NEVER write GEO / ChatGPT-mention prompts unless the product IS an AI-visibility tool

Write a MIX of these buyer intents (exactly ${TARGET_COUNT} total):
- Category pick: "what is the best note taking app for teams"
- Job to be done: "how do I organize company knowledge in one place"
- Comparison: "Notion alternatives for documentation" (only a known rival in THIS category)
- Outcome: "how can I get recommended in ChatGPT answers" (only if AI visibility)
- Short discovery: "best tools for tracking brand mentions in AI search"

Rules:
- ${MIN_WORDS}-${MAX_WORDS} words, everyday English
- Sound like something a person would actually type
- Specific category words required (note-taking, insurance claims, AI search visibility, payments, CRM, …)
- No year spam, no keyword stuffing, no "best software for startups"

Examples — note-taking / docs workspace (Notion-like):
Good: "what is the best note taking software for teams"
Good: "how can I organize my company knowledge"
Good: "best wiki tools for remote teams"
Bad: "best software for startups"
Bad: "best productivity apps for startups" (too vague if the product is docs/notes)

Examples — AI search visibility (PromptWatch-like):
Good: "how can I optimize my brand for AI search"
Good: "how do I get mentioned in ChatGPT answers"
Good: "best tools to track AI search visibility"
Bad: "best project management tools"

Examples — insurance claims AI:
Good: "how do I automate insurance claims with AI"
Good: "best AI tools for claims processing"
Bad: "Monday.com alternatives for project tracking"

Return ONLY JSON:
{"category":"2-5 word product category","prompts":[{"prompt":"...","category":"Best|How|What|Alternatives"}]}`;

  const user = `Website: ${url}
Inferred category hint: ${categoryHint}
Title: ${signals.title || signals.ogTitle || "(unknown)"}
OG title: ${signals.ogTitle || "(none)"}
Description: ${signals.description || "(none)"}
Headings: ${signals.headings.slice(0, 6).join(" | ") || "(none)"}
Page snippet: ${signals.bodySnippet.slice(0, 400) || "(none)"}

Write ${TARGET_COUNT} natural buyer questions ONLY about this product's real category (${categoryHint}). Think: what would someone ask ChatGPT before discovering this brand?`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 900,
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Gemini ${response.status}`);
  }

  const data = await response.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || "")
      .join("") || "";
  if (!text) throw new Error("Empty Gemini response");

  const parsed = extractJson(text) as { prompts?: GeminiPromptRow[] };
  if (!Array.isArray(parsed.prompts)) throw new Error("Invalid prompts JSON");
  return parsed.prompts;
}

/**
 * Generate product-fit buyer prompts (unbranded, natural, specific to the site).
 */
export async function generateBuyerPrompts(
  url: string,
  options?: { bypassCache?: boolean }
): Promise<GeneratedPrompt[]> {
  if (!options?.bypassCache) {
    const cached = await readFromCache(url);
    if (cached?.length) return cached;
  }

  const brandTokens = brandTokensFromUrl(url);
  const signals = await fetchSiteSignals(url);
  const category = heuristicCategory(url, signals);
  const allowAiVisibility = isAiVisibilityCategory(category);
  const allowProjectManagement = isProjectManagementCategory(category);

  const cleaned: GeneratedPrompt[] = [];
  const seen = new Set<string>();

  const pushRow = (row: GeminiPromptRow | GeneratedPrompt) => {
    const text = normalizePromptText(
      "prompt" in row ? row.prompt || "" : ""
    );
    if (
      !isValidBuyerPrompt(text, brandTokens, {
        allowAiVisibility,
        allowProjectManagement,
      })
    ) {
      return;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    cleaned.push({
      id: String(cleaned.length + 1),
      prompt: text,
      category: row.category || "General",
      selected: true,
      queries: [text],
    });
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const rows = await askGeminiForProductPrompts({
        apiKey,
        url,
        signals,
        categoryHint: category,
        brandTokens,
      });
      for (const row of rows) pushRow(row);
    } catch (e) {
      console.warn("Product prompt generation failed, using fallback:", e);
    }
  }

  if (cleaned.length < 4) {
    for (const seed of [
      ...contentSeedPrompts(category, signals),
      ...fillTemplates(category),
    ]) {
      pushRow(seed);
      if (cleaned.length >= TARGET_COUNT) break;
    }
  }

  // Last resort: content-native seeds only — never force project-management dumps
  if (cleaned.length === 0) {
    const seeds = allowAiVisibility
      ? fillTemplates("ai visibility")
      : contentSeedPrompts(category, signals);
    for (const seed of seeds) pushRow(seed);
  }

  const finalPrompts = cleaned.slice(0, TARGET_COUNT).map((p, i) => ({
    ...p,
    id: String(i + 1),
  }));

  await writeToCache(url, finalPrompts);
  return finalPrompts;
}
