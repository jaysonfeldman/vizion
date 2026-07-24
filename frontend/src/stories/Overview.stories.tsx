import type { Meta, StoryObj } from "@storybook/react";
import { MentionsStack } from "@/components/analytics/MentionsStack";
import { InsightsBar } from "@/components/analytics/InsightsBar";
import { PromptTable } from "@/components/analytics/PromptTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowRight, RefreshCw } from "lucide-react";
import type { TopicResult } from "@/lib/types";

const topics: TopicResult[] = [
  {
    prompt: "best smartphones for everyday use",
    category: "Best",
    sub_query_count: 3,
    citation_rate: 0.67,
    presence_rate: 1,
    cited_count: 2,
    retrieved_count: 3,
    missing_count: 0,
    sub_queries: [
      {
        query: "best smartphones for everyday use",
        status: "cited",
        retrieved: true,
        cited: true,
        rank: 1,
        avg_rank: 1,
        total_citations: 4,
        total_sources: 6,
        all_domains: ["apple.com", "samsung.com", "gsmarena.com"],
        sources: [
          {
            domain: "apple.com",
            url: "https://www.apple.com",
            title: "Apple",
            is_you: true,
          },
          {
            domain: "samsung.com",
            url: "https://www.samsung.com",
            title: "Samsung",
          },
          {
            domain: "gsmarena.com",
            url: "https://www.gsmarena.com",
            title: "GSMArena",
          },
        ],
        winner: "apple.com",
        matched_as: "apple.com",
      },
      {
        query: "best phone under one thousand",
        status: "retrieved",
        retrieved: true,
        cited: false,
        rank: null,
        avg_rank: null,
        total_citations: 3,
        total_sources: 5,
        all_domains: ["reddit.com", "apple.com"],
        sources: [
          { domain: "reddit.com", url: "https://reddit.com", title: "Reddit" },
          {
            domain: "apple.com",
            url: "https://www.apple.com",
            title: "Apple",
            is_you: true,
          },
        ],
        winner: "reddit.com",
        matched_as: "apple.com",
      },
      {
        query: "iPhone vs Android camera",
        status: "cited",
        retrieved: true,
        cited: true,
        rank: 2,
        avg_rank: 2,
        total_citations: 5,
        total_sources: 7,
        all_domains: ["theverge.com", "apple.com", "youtube.com"],
        sources: [
          {
            domain: "theverge.com",
            url: "https://www.theverge.com",
            title: "The Verge",
          },
          {
            domain: "apple.com",
            url: "https://www.apple.com",
            title: "Apple",
            is_you: true,
          },
          {
            domain: "youtube.com",
            url: "https://youtube.com",
            title: "YouTube",
          },
        ],
        winner: "theverge.com",
        matched_as: "apple.com",
      },
    ],
  },
];

function Overview() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-12 p-4 pb-20">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-black/40">
          Vizion design system
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.04em] text-black">
          Component overview
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-black/55">
          Interactive gallery of soft UI controls, metrics, tables, and popups.
          Click anything — inputs, buttons, and the sources stack all work live
          in Storybook.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-black">Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="soft-cta inline-flex h-11 items-center gap-2 rounded-2xl px-5 text-sm font-medium"
          >
            Run analysis
            <ArrowRight className="size-4" />
          </button>
          <button
            type="button"
            className="soft-outline inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-medium"
          >
            <RefreshCw className="size-3.5" />
            New analysis
          </button>
          <Button>Shadcn default</Button>
          <Button variant="outline">Outline</Button>
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-black">Inputs</h2>
        <input
          className="soft-inset h-12 w-full max-w-md rounded-2xl px-4 text-sm outline-none"
          placeholder="soft-inset domain field"
          defaultValue="apple.com"
        />
        <div className="prompt-field max-w-md rounded-2xl">
          <input
            className="w-full bg-transparent px-3.5 py-3 text-sm outline-none"
            defaultValue="Best smartphones for everyday use"
          />
        </div>
        <Input className="max-w-md" placeholder="Shadcn input" />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-black">Card</h2>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Visibility</CardTitle>
            <CardDescription>Share of AI answers that name you.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-semibold tracking-tight text-emerald-600">
              72%
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-black">
          Sources popup (click the stack)
        </h2>
        <MentionsStack
          target="apple.com"
          sources={topics[0].sub_queries[0].sources}
          provider="gemini"
          model="gemini-flash-latest"
          defaultOpen
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-black">Metrics + prompts</h2>
        <div className="soft-inset overflow-hidden rounded-2xl">
          <InsightsBar
            topics={topics}
            target="apple.com"
            kpis={{
              citation_rate: 0.67,
              presence_rate: 1,
              avg_rank: 1.5,
              share_of_voice: 0.4,
              sample_size: 15,
              cited_count: 10,
              retrieved_count: 15,
              missing_count: 0,
              topic_count: 1,
            }}
          />
          <PromptTable
            topics={topics}
            target="apple.com"
            connected
            defaultOpenFirst
            provider="gemini"
            model="gemini-flash-latest"
          />
          <p className="border-t border-black/5 px-5 py-3 text-[11px] text-black/35 sm:px-6">
            Analyzed with Gemini · gemini-flash-latest
          </p>
        </div>
      </section>
    </div>
  );
}

const meta: Meta = {
  title: "Overview",
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

export const DesignSystem: Story = {
  render: () => <Overview />,
};
