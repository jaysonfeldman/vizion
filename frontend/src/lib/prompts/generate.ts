import { GeneratedPrompt } from "@/lib/types";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const CACHE_DIR = path.join(process.cwd(), ".cache", "prompts");
const CACHE_EXPIRY_HOURS = 24;
/** Realistic category buyer questions for any company type (SaaS, consumer, etc.). */
export const PROMPT_CACHE_VERSION = "v23-universal-prompts";
const TARGET_COUNT = 5;
const MAX_WORDS = 22;
const MIN_WORDS = 5;
const META_TIMEOUT_MS = 8000;
const GEMINI_TIMEOUT_MS = 14000;

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
  /\bspecialized software\b/i,
  /\bbest .+ tools for companies\b/i,
  /\bhow (do|can) i choose a .+ solution\b/i,
  /\balternatives?\s+to\s+(semrush|ahrefs|moz|hubspot|salesforce|similarweb|google analytics)\b/i,
];

/** AI-visibility phrasing — only valid when the site IS an AI-visibility product. */
const AI_VISIBILITY_PROMPT =
  /\b(ai search|geo\b|generative engine|chatgpt|perplexity|llm (brand|rank|mention)|brand mentions? in (ai|chatgpt|perplexity)|ai visibility|prompt.?watch)\b/i;

const BROAD_ONLY = /\b(software|saas|platform|solution|tool|app|product)s?\b/i;
const SPECIFIC_SIGNAL =
  /\b(note[- ]?tak|wiki|docs?|knowledge base|payment|checkout|billing|crm|seo|analytics|email|newsletter|design|figma|hosting|devops|visibility|geo|citation|project|task|kanban|productivity|work.?os|spreadsheet|database|auth|invoice|accounting|hr|recruit|support|chat|video|meeting|calendar|storage|cdn|cms|e-?commerce|shopify|stripe|notion|slack|asana|monday\.com|trello|jira|chatgpt|perplexity|brand mention|prompt|workflow|roadmap|sprint|issue track|insurance|claims?|agentic|ai agents?|underwrit|mga|broker|smartphone|iphone|android|laptop|macbook|tablet|ipad|smartwatch|wearable|headphones?|earbuds?|camera|tv|gaming|console|sneaker|running shoes|apparel|skincare|makeup|furniture|mattress|coffee|grocery|restaurant|hotel|flight|banking|investing|insurance|dentist|lawyer|agency|branding)\b/i;

type CompanyType =
  | "saas"
  | "consumer"
  | "ecommerce"
  | "agency"
  | "services"
  | "media"
  | "unknown";

type CompanyProfile = {
  category: string;
  companyType: CompanyType;
};

const PROJECT_MGMT_PROMPT =
  /\b(project management|productivity apps?|monday\.com|asana|task tracking|work across tasks docs)\b/i;

type SiteSignals = {
  title: string;
  description: string;
  ogTitle: string;
  headings: string[];
  bodySnippet: string;
  /** Short offering phrases mined from JSON-LD / meta (not brand names). */
  offerings: string[];
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
    offerings: [],
  };
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(META_TIMEOUT_MS),
    });
    if (!response.ok) return empty;

    const reader = response.body?.getReader();
    let html = "";
    if (!reader) {
      html = (await response.text()).slice(0, 160_000);
    } else {
      const decoder = new TextDecoder();
      while (html.length < 160_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        // Need body/JSON-LD for unknown brands — don't stop at </head> alone
        const hasMeta = /<title[\s>]/i.test(html);
        const hasJsonLd = /application\/ld\+json/i.test(html);
        const hasBodyText = /<h[1-3][\s>]/i.test(html) || /<\/p>/i.test(html);
        if (html.length > 40_000 && hasMeta && (hasJsonLd || hasBodyText)) break;
        if (html.length > 120_000) break;
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
    .replace(/<script(?![^>]*ld\+json)[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  const bodySnippet = decodeEntities(stripped).slice(0, 900);

  const offerings = extractJsonLdOfferings(html);

  return { title, description, ogTitle, headings, bodySnippet, offerings };
}

function extractJsonLdOfferings(html: string): string[] {
  const out: string[] = [];
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < 8) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const nodes = Array.isArray(parsed)
        ? parsed
        : parsed?.["@graph"]
          ? parsed["@graph"]
          : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const type = String(node["@type"] || "").toLowerCase();
        const candidates = [
          node.category,
          node.applicationCategory,
          node.description,
          node.slogan,
          Array.isArray(node.knowsAbout) ? node.knowsAbout.join(" ") : null,
          node.name && type.includes("product") ? node.name : null,
        ];
        for (const c of candidates) {
          if (typeof c !== "string") continue;
          const cleaned = decodeEntities(c).replace(/\s+/g, " ").trim();
          if (cleaned.length >= 8 && cleaned.length <= 80) out.push(cleaned);
        }
      }
    } catch {
      /* ignore bad JSON-LD */
    }
  }
  return out.slice(0, 6);
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

const QUESTION_START =
  /^(how|what|which|why|when|where|who|whom|whose|do|does|did|is|are|was|were|can|could|should|would|will|may|might|am|have|has|had)\b/i;

function normalizePromptText(raw: string): string {
  let t = raw
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .trim()
    .replace(/[?.!]+$/, "");
  if (!t) return "";
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (QUESTION_START.test(t)) t += "?";
  return t;
}

export function isValidBuyerPrompt(
  prompt: string,
  brandTokens: string[],
  options?: {
    allowAiVisibility?: boolean;
    allowProjectManagement?: boolean;
    companyType?: CompanyType;
  }
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
  // Non-software companies should not get SaaS shopping language
  if (
    options?.companyType &&
    options.companyType !== "saas" &&
    options.companyType !== "unknown" &&
    /\b(saas|for (startups?|teams|companies)|software tools?|platform for teams)\b/i.test(
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

/** Content tokens from the live site — used to keep prompts on-category. */
function contextTokens(
  profile: CompanyProfile,
  signals: SiteSignals,
  brandTokens: string[]
): string[] {
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "your",
    "our",
    "this",
    "that",
    "into",
    "over",
    "best",
    "more",
    "than",
    "about",
    "their",
    "have",
    "will",
    "just",
    "like",
    "make",
    "made",
    "using",
    "online",
    "official",
    "home",
    "page",
    "website",
    "site",
    "company",
    "brand",
    "world",
    "discover",
    "shop",
    "everything",
  ]);
  const blob = [
    profile.category,
    ...signals.offerings,
    signals.title,
    signals.ogTitle,
    signals.description,
    ...signals.headings.slice(0, 6),
    signals.bodySnippet.slice(0, 400),
  ]
    .join(" ")
    .toLowerCase();

  const toks = blob
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(
      (t) =>
        t.length >= 4 &&
        !stop.has(t) &&
        !brandTokens.some((b) => b && (t.includes(b) || b.includes(t)))
    );

  return Array.from(new Set(toks)).slice(0, 40);
}

function promptFitsContext(
  prompt: string,
  tokens: string[],
  profile: CompanyProfile
): boolean {
  if (!tokens.length) return true; // no signals — rely on Gemini/heuristics only
  const lower = prompt.toLowerCase();
  const hits = tokens.filter((t) => lower.includes(t)).length;
  if (hits >= 1) return true;
  // SaaS banks often use category synonyms already validated elsewhere
  if (profile.companyType === "saas" && SPECIFIC_SIGNAL.test(prompt)) return true;
  // Hardcoded high-quality banks for known categories
  if (!isWeakCategory(profile.category)) {
    const catBits = profile.category
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    if (catBits.some((w) => lower.includes(w))) return true;
  }
  return false;
}

/** Turn a long/awkward phrase into a short noun buyers would type. */
function shortOfferingNoun(
  profile: CompanyProfile,
  signals: SiteSignals,
  brandTokens: string[]
): string {
  const candidates = [
    profile.category,
    ...signals.offerings,
    ...signals.headings.slice(0, 4),
    signals.description.split(/[.|•·]/)[0] || "",
  ]
    .map((s) =>
      s
        .toLowerCase()
        .replace(/\b(the|our|we|a|an|official|website|home)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((s) => s.length >= 4 && s.length <= 48)
    .filter((s) => !brandTokens.some((b) => b && s.includes(b)))
    .filter((s) => !isWeakCategory(s));

  for (const c of candidates) {
    const words = c.split(/\s+/);
    if (words.length <= 5) return c;
    // Prefer trailing noun-ish chunk: "innovative world of phones" → keep last 3-4
    return words.slice(-4).join(" ");
  }
  if (profile.companyType === "saas") return "software for teams";
  if (profile.companyType === "agency") return "creative agency";
  if (profile.companyType === "services") return "professional service";
  if (profile.companyType === "ecommerce") return "products online";
  if (profile.companyType === "consumer") return "products";
  return "this category";
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

type GeminiPromptRow = {
  prompt?: string;
  category?: string;
};

type GeminiPromptResult = {
  category?: string;
  companyType?: CompanyType;
  prompts: GeminiPromptRow[];
};

/** Well-known domains → product category + company type. */
const DOMAIN_PROFILE: Array<[RegExp, CompanyProfile]> = [
  [
    /clickup\.com|asana\.com|monday\.com|linear\.app|basecamp\.com|jira|atlassian\.com|trello\.com|wrike\.com|smartsheet\.com|height\.app|shortcut\.com/,
    { category: "project management", companyType: "saas" },
  ],
  [
    /notion\.so|coda\.io|evernote\.com|obsidian\.md|roamresearch/,
    { category: "note-taking", companyType: "saas" },
  ],
  [
    /stripe\.com|paddle\.com|braintree|adyen\.com|square\.com/,
    { category: "payment", companyType: "saas" },
  ],
  [
    /hubspot\.com|salesforce\.com|pipedrive\.com|close\.com|attio\.com/,
    { category: "CRM", companyType: "saas" },
  ],
  [
    /mailchimp\.com|klaviyo\.com|convertkit\.com|beehiiv\.com|substack\.com/,
    { category: "email marketing", companyType: "saas" },
  ],
  [
    /figma\.com|canva\.com|sketch\.com|framer\.com/,
    { category: "design", companyType: "saas" },
  ],
  [
    /ahrefs\.com|semrush\.com|moz\.com|surfer\.com/,
    { category: "SEO", companyType: "saas" },
  ],
  [
    /promptwatch|peec\.ai|otterly|goodie\.ai|rankscale|athena.?hq/,
    { category: "AI visibility", companyType: "saas" },
  ],
  [
    /apple\.com/,
    { category: "consumer electronics", companyType: "consumer" },
  ],
  [
    /samsung\.com/,
    { category: "consumer electronics", companyType: "consumer" },
  ],
  [
    /google\.com|store\.google\.com/,
    { category: "consumer electronics", companyType: "consumer" },
  ],
  [
    /sony\.com|lg\.com|dell\.com|lenovo\.com|hp\.com|asus\.com|microsoft\.com/,
    { category: "consumer electronics", companyType: "consumer" },
  ],
  [
    /nike\.com|adidas\.com|newbalance\.com|puma\.com/,
    { category: "athletic shoes and apparel", companyType: "consumer" },
  ],
  [
    /ikea\.com|wayfair\.com|westelm\.com/,
    { category: "home furniture", companyType: "ecommerce" },
  ],
  [
    /amazon\.com|ebay\.com|walmart\.com|target\.com/,
    { category: "online shopping", companyType: "ecommerce" },
  ],
  [
    /airbnb\.com|booking\.com|expedia\.com|vrbo\.com/,
    { category: "vacation rentals and travel stays", companyType: "ecommerce" },
  ],
];

const SAAS_CATEGORIES = new Set([
  "project management",
  "note-taking",
  "payment",
  "crm",
  "email marketing",
  "design",
  "seo",
  "ai visibility",
  "ai agents",
  "insurance claims ai",
  "analytics",
  "cloud",
  "productivity software",
]);

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

function inferCompanyType(
  category: string,
  blob: string,
  hinted?: CompanyType
): CompanyType {
  if (hinted && hinted !== "unknown") return hinted;
  const c = category.toLowerCase();
  if (SAAS_CATEGORIES.has(c) || /\b(saas|software|platform|api|crm|seo)\b/.test(c)) {
    return "saas";
  }
  if (
    /\b(smartphone|iphone|android|laptop|tablet|ipad|macbook|smartwatch|electronics|headphones?|earbuds?|camera|console|gaming)\b/.test(
      `${c} ${blob}`
    )
  ) {
    return "consumer";
  }
  if (
    /\b(shop|store|buy online|free shipping|cart|checkout|ecommerce|e-commerce)\b/.test(
      blob
    )
  ) {
    return "ecommerce";
  }
  if (/\b(agency|studio|consultancy|consulting)\b/.test(`${c} ${blob}`)) {
    return "agency";
  }
  if (/\b(news|magazine|blog|publisher|media)\b/.test(`${c} ${blob}`)) {
    return "media";
  }
  if (
    /\b(dentist|lawyer|clinic|hotel|restaurant|booking|insurance|bank|service)\b/.test(
      `${c} ${blob}`
    )
  ) {
    return "services";
  }
  return "unknown";
}

function isWeakCategory(category: string): boolean {
  const c = category.trim().toLowerCase();
  return (
    !c ||
    c === "specialized software" ||
    c === "this product" ||
    c === "product" ||
    c === "software" ||
    c === "productivity software" ||
    c === "company" ||
    c === "website"
  );
}

function heuristicCompanyProfile(
  url: string,
  signals: SiteSignals
): CompanyProfile {
  const host = (() => {
    try {
      return new URL(url.startsWith("http") ? url : `https://${url}`).hostname
        .replace(/^www\./, "")
        .toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();

  for (const [re, profile] of DOMAIN_PROFILE) {
    if (re.test(host) || re.test(url.toLowerCase())) return profile;
  }

  const blob = signalBlob(url, signals);
  const rules: Array<[RegExp, CompanyProfile]> = [
    [
      /\b(prompt.?watch|peec\.ai|generative engine optimization|\bgeo\b|llm.?monitor|brand.?mention|ai search visibility)\b/,
      { category: "AI visibility", companyType: "saas" },
    ],
    [
      /\b(insurance|claims? processing|claims? agent|mga|tpa|policyholder|loss adjust)\b/,
      { category: "insurance claims AI", companyType: "saas" },
    ],
    [
      /\b(agentic ai|ai agents?|autonomous agents?|llm agents?)\b/,
      { category: "AI agents", companyType: "saas" },
    ],
    [
      /\b(project management|task management|work os|kanban board|sprint planning|issue track)\b/,
      { category: "project management", companyType: "saas" },
    ],
    [
      /\b(note.?tak|wiki|knowledge.?base|team docs|second brain)\b/,
      { category: "note-taking", companyType: "saas" },
    ],
    [
      /\b(payment|checkout|billing|invoice|subscription billing)\b/,
      { category: "payment", companyType: "saas" },
    ],
    [/\b(seo|search.?engine|backlink|keyword research)\b/, { category: "SEO", companyType: "saas" }],
    [/\b(crm|sales.?pipeline|deal pipeline)\b/, { category: "CRM", companyType: "saas" }],
    [
      /\b(email.?market|newsletter|drip campaign)\b/,
      { category: "email marketing", companyType: "saas" },
    ],
    [
      /\b(analytics|bi dashboard|product analytics)\b/,
      { category: "analytics", companyType: "saas" },
    ],
    [
      /\b(ui design|product design|prototyping|figma)\b/,
      { category: "design", companyType: "saas" },
    ],
    [
      /\b(hosting|cloud infra|devops|vercel|aws)\b/,
      { category: "cloud", companyType: "saas" },
    ],
    [
      /\b(iphone|ipad|macbook|smartphone|android phone|laptop|tablet|smartwatch|airpods|consumer electronics)\b/,
      { category: "consumer electronics", companyType: "consumer" },
    ],
    [
      /\b(running shoes|sneakers|athletic wear|streetwear|apparel)\b/,
      { category: "athletic shoes and apparel", companyType: "consumer" },
    ],
    [
      /\b(furniture|sofa|mattress|home decor)\b/,
      { category: "home furniture", companyType: "ecommerce" },
    ],
    [
      /\b(branding agency|design agency|marketing agency|creative studio)\b/,
      { category: "branding and design agency", companyType: "agency" },
    ],
  ];
  for (const [re, profile] of rules) {
    if (re.test(blob)) return profile;
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
    if (niche) {
      const category = niche.toLowerCase();
      return {
        category,
        companyType: inferCompanyType(category, blob),
      };
    }
  }

  // Phrase from description — never use the brand/domain label alone
  const brand = brandTokensFromUrl(url);
  for (const offering of signals.offerings) {
    const clipped = offering
      .replace(/\b(the|our|we|a|an)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (
      clipped.length >= 8 &&
      clipped.length <= 64 &&
      !isWeakCategory(clipped) &&
      !brand.some((tok) => tok && clipped.includes(tok))
    ) {
      return {
        category: clipped,
        companyType: inferCompanyType(clipped, blob),
      };
    }
  }

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
    if (clipped.length >= 8 && clipped.length <= 64 && !isWeakCategory(clipped)) {
      return {
        category: clipped,
        companyType: inferCompanyType(clipped, blob),
      };
    }
  }

  // Offering words from headings / body when meta is brand-only (Apple-style)
  const offeringBlob = `${signals.headings.join(" ")} ${signals.bodySnippet}`
    .toLowerCase()
    .replace(/[^a-z0-9\s+/&-]/g, " ");
  const offeringMatch = offeringBlob.match(
    /\b((smartphones?|phones?|laptops?|tablets?|computers?|watches?|headphones?|earbuds?|cameras?|tvs?|consoles?|sneakers?|shoes?|apparel|furniture|mattress(?:es)?|skincare|makeup)(?:\s+(?:and|&)\s+(?:computers?|electronics|accessories|apparel|tablets?))?)\b/
  );
  if (offeringMatch?.[1]) {
    const category = offeringMatch[1].replace(/\s+/g, " ").trim();
    return {
      category,
      companyType: inferCompanyType(category, blob, "consumer"),
    };
  }

  return { category: "this category", companyType: "unknown" };
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
  profile: CompanyProfile,
  signals: SiteSignals,
  brandTokens: string[] = []
): GeneratedPrompt[] {
  const niche = shortOfferingNoun(profile, signals, brandTokens);

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

  const blob = `${signals.title} ${signals.description} ${profile.category} ${signals.offerings.join(" ")}`.toLowerCase();
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

  if (
    profile.companyType === "consumer" &&
    /\b(electronics|smartphone|phone|laptop|tablet|computer|watch|headphone)\b/.test(
      `${niche} ${blob}`
    )
  ) {
    return pack([
      "best smartphones for everyday use",
      "how do I choose a laptop for work and school",
      "best tablets for students and note taking",
      "what is the best smartwatch for fitness tracking",
      "Android vs iPhone which phone should I buy",
    ]);
  }

  // Type-aware templates using a short noun — works for ANY inferred category
  if (profile.companyType === "consumer" || profile.companyType === "ecommerce") {
    return pack([
      `best ${niche} for everyday use`,
      `how do I choose the right ${niche}`,
      `what should I look for when buying ${niche}`,
      `popular ${niche} alternatives worth considering`,
      `how to compare ${niche} before buying`,
    ]);
  }

  if (profile.companyType === "agency") {
    return pack([
      `best ${niche} for growing brands`,
      `how do I hire a ${niche}`,
      `what to look for in a ${niche}`,
      `${niche} alternatives for small brands`,
      `how much does a good ${niche} usually cost`,
    ]);
  }

  if (profile.companyType === "services") {
    // Professionals/providers vs platforms — avoid "hire a travel booking"
    if (/\b(dentist|lawyer|plumber|electrician|clinic|agency|consultant|coach)\b/.test(niche)) {
      return pack([
        `how do I choose a good ${niche}`,
        `what should I ask before hiring a ${niche}`,
        `best ${niche} for first time customers`,
        `${niche} alternatives worth comparing`,
        `how much does ${niche} usually cost`,
      ]);
    }
    return pack([
      `how do I choose the right ${niche}`,
      `what should I look for in ${niche}`,
      `best ${niche} for first time customers`,
      `${niche} alternatives worth comparing`,
      `how much does ${niche} usually cost`,
    ]);
  }

  if (profile.companyType === "media") {
    return pack([
      `best places to read about ${niche}`,
      `how do I stay up to date on ${niche}`,
      `what are reliable sources for ${niche}`,
      `${niche} newsletters worth following`,
      `how to learn the basics of ${niche}`,
    ]);
  }

  if (profile.companyType === "saas") {
    return pack([
      `what is the best ${niche} for startups`,
      `how do I get better results with ${niche}`,
      `best ${niche} for small teams`,
      `how can I choose a ${niche} for my team`,
      `${niche} alternatives for growing teams`,
    ]);
  }

  // Unknown type: still grounded in the extracted offering noun
  return pack([
    `best ${niche} for everyday use`,
    `how do I choose the right ${niche}`,
    `what is the best ${niche} right now`,
    `popular ${niche} alternatives worth considering`,
    `how to compare options for ${niche}`,
  ]);
}

/** Category-aware fallbacks when Gemini fails. */
function fillTemplates(profile: CompanyProfile): GeneratedPrompt[] {
  let c = profile.category.trim().toLowerCase();
  if (isWeakCategory(c)) {
    c =
      profile.companyType === "saas"
        ? "productivity software"
        : profile.companyType === "consumer"
          ? "consumer electronics"
          : "this category";
  }

  const banks: Record<string, Array<{ prompt: string; category: string }>> = {
    "consumer electronics": [
      {
        prompt: "best smartphones for everyday use",
        category: "Best",
      },
      {
        prompt: "how do I choose a laptop for work and school",
        category: "How",
      },
      {
        prompt: "best tablets for students and note taking",
        category: "Best",
      },
      {
        prompt: "what is the best smartwatch for fitness tracking",
        category: "What",
      },
      {
        prompt: "Android vs iPhone which phone should I buy",
        category: "Alternatives",
      },
    ],
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

  // Unknown niche: synthesize from the real category — never invent SaaS filler
  const seeds =
    profile.companyType === "saas"
      ? [
          { prompt: `best ${c} for startups`, category: "Best" },
          { prompt: `how do I choose a ${c} for my team`, category: "How" },
          { prompt: `what is the best ${c} for small teams`, category: "What" },
          { prompt: `${c} alternatives for growing teams`, category: "Alternatives" },
          { prompt: `how to get better results with ${c}`, category: "How" },
        ]
      : profile.companyType === "agency" || profile.companyType === "services"
        ? [
            { prompt: `how do I choose a good ${c}`, category: "How" },
            { prompt: `what should I look for in a ${c}`, category: "What" },
            { prompt: `best ${c} for first time customers`, category: "Best" },
            { prompt: `${c} alternatives worth comparing`, category: "Alternatives" },
            { prompt: `how much does ${c} usually cost`, category: "How" },
          ]
        : [
            { prompt: `best ${c} for everyday use`, category: "Best" },
            { prompt: `how do I choose the right ${c}`, category: "How" },
            { prompt: `what should I look for when buying ${c}`, category: "What" },
            { prompt: `popular ${c} alternatives worth considering`, category: "Alternatives" },
            { prompt: `how to compare ${c} before buying`, category: "How" },
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
 * One Gemini call: infer what the company sells, then write fitting buyer questions.
 * When forceInfer is true (unknown/weak heuristic), Gemini must decide category from
 * the URL + page — ignore weak hints like "this category".
 */
async function askGeminiForProductPrompts(args: {
  apiKey: string;
  url: string;
  signals: SiteSignals;
  profile: CompanyProfile;
  brandTokens: string[];
  forceInfer?: boolean;
}): Promise<GeminiPromptResult> {
  const { apiKey, url, signals, profile, brandTokens, forceInfer } = args;
  const brandHint = brandTokens[1] || "the brand";
  const categoryHint = forceInfer || isWeakCategory(profile.category)
    ? "(infer from the website — do not invent software)"
    : profile.category;
  const typeHint =
    forceInfer || profile.companyType === "unknown"
      ? "(infer: saas|consumer|ecommerce|agency|services|media)"
      : profile.companyType;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const system = `You write the questions real buyers type into ChatGPT / Perplexity / Gemini when researching ANY kind of company — SaaS, consumer brands, ecommerce, agencies, local services, media, etc.

Goal: category-intent questions (NOT brand-name questions). First decide what the company actually sells or does, THEN ask like a buyer who does not know this brand yet.

CRITICAL:
1. Category hint: "${categoryHint}"
2. Company type hint: "${typeHint}"
3. If hints are weak/missing, INFER from the URL, title, description, headings, and offerings. Prefer real-world knowledge of the domain when the page is sparse.
4. Every prompt must match that real category / job-to-be-done
5. Unbranded: never use "${brandHint}" or the domain
6. NEVER invent an unrelated niche (especially never invent "specialized software" for non-software brands)
7. NEVER write GEO / ChatGPT-mention prompts unless the product IS an AI-visibility tool
8. Match language to company type:
   - saas: tools, workflows, teams, startups OK
   - consumer / ecommerce: products people buy — NOT "software tools for companies"
   - agency / services: hiring, pricing, how to choose a provider
   - media: topics people read / learn about
9. Prompts must sound like something a real person would type (natural grammar)

Write exactly ${TARGET_COUNT} buyer questions mixing:
- Category pick ("best …")
- How-to / job-to-be-done
- Comparison / alternatives
- Outcome or buying criteria

Rules:
- ${MIN_WORDS}-${MAX_WORDS} words, everyday English
- Specific category words required
- No year spam, no keyword stuffing
- No "best software for startups" unless the company is software
- No "specialized software", "tools for companies", or "platform for teams" for non-software brands

Examples — consumer electronics:
Good: "best smartphones for everyday use"
Good: "how do I choose a laptop for creative work"
Bad: "best specialized software tools for companies"

Examples — athletic apparel:
Good: "best running shoes for beginners"
Good: "how do I choose training shoes for the gym"
Bad: "best tools for specialized software"

Examples — note-taking SaaS:
Good: "what is the best note taking software for teams"
Good: "how can I organize my company knowledge"
Bad: "best software for startups"

Examples — local service:
Good: "how do I choose a reliable dentist near me"
Good: "what should I ask before hiring a plumber"
Bad: "best project management tools"

Return ONLY JSON:
{"category":"2-6 word real product/service category","companyType":"saas|consumer|ecommerce|agency|services|media|unknown","prompts":[{"prompt":"...","category":"Best|How|What|Alternatives"}]}`;

  const user = `Website: ${url}
Inferred category hint: ${categoryHint}
Inferred company type: ${typeHint}
Title: ${signals.title || signals.ogTitle || "(unknown)"}
OG title: ${signals.ogTitle || "(none)"}
Description: ${signals.description || "(none)"}
Offerings / JSON-LD: ${signals.offerings.slice(0, 4).join(" | ") || "(none)"}
Headings: ${signals.headings.slice(0, 6).join(" | ") || "(none)"}
Page snippet: ${signals.bodySnippet.slice(0, 400) || "(none)"}

Write ${TARGET_COUNT} natural buyer questions ONLY about what this company actually sells or does.`;

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
        temperature: forceInfer ? 0.4 : 0.35,
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

  const parsed = extractJson(text) as {
    category?: string;
    companyType?: string;
    prompts?: GeminiPromptRow[];
  };
  if (!Array.isArray(parsed.prompts)) throw new Error("Invalid prompts JSON");

  const allowedTypes: CompanyType[] = [
    "saas",
    "consumer",
    "ecommerce",
    "agency",
    "services",
    "media",
    "unknown",
  ];
  const companyType = allowedTypes.includes(parsed.companyType as CompanyType)
    ? (parsed.companyType as CompanyType)
    : undefined;

  return {
    category: typeof parsed.category === "string" ? parsed.category.trim() : undefined,
    companyType,
    prompts: parsed.prompts,
  };
}

function applyGeminiProfile(
  current: CompanyProfile,
  result: GeminiPromptResult,
  url: string,
  signals: SiteSignals
): CompanyProfile {
  if (result.category && !isWeakCategory(result.category)) {
    return {
      category: result.category.toLowerCase(),
      companyType: inferCompanyType(
        result.category,
        signalBlob(url, signals),
        result.companyType || current.companyType
      ),
    };
  }
  if (result.companyType && result.companyType !== "unknown") {
    return { ...current, companyType: result.companyType };
  }
  return current;
}

/**
 * Generate product-fit buyer prompts (unbranded, natural, specific to the site).
 * Works for any company type: Gemini infers category; heuristics/templates are backup.
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
  let profile = heuristicCompanyProfile(url, signals);
  let allowAiVisibility = isAiVisibilityCategory(profile.category);
  let allowProjectManagement = isProjectManagementCategory(profile.category);
  const tokens = () => contextTokens(profile, signals, brandTokens);

  const cleaned: GeneratedPrompt[] = [];
  const seen = new Set<string>();

  const pushRow = (
    row: GeminiPromptRow | GeneratedPrompt,
    opts?: { requireContext?: boolean }
  ) => {
    const text = normalizePromptText(
      "prompt" in row ? row.prompt || "" : ""
    );
    if (
      !isValidBuyerPrompt(text, brandTokens, {
        allowAiVisibility,
        allowProjectManagement,
        companyType: profile.companyType,
      })
    ) {
      return;
    }
    if (opts?.requireContext !== false && !promptFitsContext(text, tokens(), profile)) {
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
  const weakHeuristic =
    isWeakCategory(profile.category) || profile.companyType === "unknown";

  if (apiKey) {
    const attempts: Array<{ forceInfer: boolean }> = weakHeuristic
      ? [{ forceInfer: true }, { forceInfer: false }]
      : [{ forceInfer: false }, { forceInfer: true }];

    for (const attempt of attempts) {
      if (cleaned.length >= TARGET_COUNT) break;
      try {
        const result = await askGeminiForProductPrompts({
          apiKey,
          url,
          signals,
          profile,
          brandTokens,
          forceInfer: attempt.forceInfer,
        });
        profile = applyGeminiProfile(profile, result, url, signals);
        allowAiVisibility = isAiVisibilityCategory(profile.category);
        allowProjectManagement = isProjectManagementCategory(profile.category);
        // Gemini answers are trusted more than keyword overlap (it saw the page)
        for (const row of result.prompts) {
          pushRow(row, { requireContext: false });
        }
      } catch (e) {
        console.warn("Product prompt generation failed, using fallback:", e);
      }
    }
  }

  if (cleaned.length < 4) {
    for (const seed of [
      ...contentSeedPrompts(profile, signals, brandTokens),
      ...fillTemplates({
        ...profile,
        category: shortOfferingNoun(profile, signals, brandTokens),
      }),
    ]) {
      // Fallbacks must stay on-category when we have site tokens
      pushRow(seed, { requireContext: tokens().length > 0 });
      if (cleaned.length >= TARGET_COUNT) break;
    }
  }

  // Last resort: drop context gate so we still return editable prompts
  if (cleaned.length === 0) {
    const seeds = allowAiVisibility
      ? fillTemplates({ category: "ai visibility", companyType: "saas" })
      : contentSeedPrompts(profile, signals, brandTokens);
    for (const seed of seeds) pushRow(seed, { requireContext: false });
  }

  const finalPrompts = cleaned.slice(0, TARGET_COUNT).map((p, i) => ({
    ...p,
    id: String(i + 1),
  }));

  await writeToCache(url, finalPrompts);
  return finalPrompts;
}
