import type { Meta, StoryObj } from "@storybook/react";
import { InsightsBar } from "./InsightsBar";
import type { TopicResult } from "@/lib/types";

const topics: TopicResult[] = [
  {
    prompt: "best note taking app for startups",
    category: "Best",
    sub_query_count: 5,
    citation_rate: 0.55,
    presence_rate: 0.6,
    cited_count: 3,
    retrieved_count: 3,
    missing_count: 2,
    sub_queries: [
      {
        query: "best wiki tools",
        status: "cited",
        retrieved: true,
        cited: true,
        rank: 2,
        avg_rank: 2,
        total_citations: 1,
        total_sources: 4,
        all_domains: ["notion.so", "evernote.com", "coda.io", "obsidian.md"],
        winner: "evernote.com",
        matched_as: "notion.so",
      },
    ],
  },
];

const meta: Meta<typeof InsightsBar> = {
  title: "Analytics/InsightsBar",
  component: InsightsBar,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof InsightsBar>;

export const Default: Story = {
  args: {
    topics,
    target: "notion.so",
    kpis: {
      citation_rate: 0.55,
      presence_rate: 0.6,
      avg_rank: 2.5,
      share_of_voice: 0.28,
      sample_size: 20,
      cited_count: 11,
      retrieved_count: 12,
      missing_count: 8,
      topic_count: 4,
    },
  },
};
