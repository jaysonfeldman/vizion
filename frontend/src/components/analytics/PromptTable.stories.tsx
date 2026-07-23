import type { Meta, StoryObj } from "@storybook/react";
import { PromptTable } from "./PromptTable";
import type { TopicResult } from "@/lib/types";

const sampleTopics: TopicResult[] = [
  {
    prompt: "best AI visibility tools",
    category: "Discovery",
    sub_query_count: 3,
    citation_rate: 0,
    presence_rate: 0,
    cited_count: 0,
    retrieved_count: 0,
    missing_count: 3,
    sub_queries: [
      {
        query: "best AI visibility tools",
        status: "missing",
        retrieved: false,
        cited: false,
        rank: null,
        avg_rank: null,
        total_citations: 4,
        total_sources: 6,
        all_domains: ["semrush.com", "ahrefs.com", "g2.com"],
        winner: "semrush.com",
        matched_as: null,
      },
      {
        query: "AI brand monitoring tools",
        status: "missing",
        retrieved: false,
        cited: false,
        rank: null,
        avg_rank: null,
        total_citations: 3,
        total_sources: 5,
        all_domains: ["peec.ai", "semrush.com"],
        winner: "peec.ai",
        matched_as: null,
      },
      {
        query: "track brand mentions in ChatGPT",
        status: "missing",
        retrieved: false,
        cited: false,
        rank: null,
        avg_rank: null,
        total_citations: 2,
        total_sources: 4,
        all_domains: ["hubspot.com", "g2.com"],
        winner: "hubspot.com",
        matched_as: null,
      },
    ],
  },
  {
    prompt: "how to track AI brand mentions",
    category: "How-to",
    sub_query_count: 3,
    citation_rate: 0.33,
    presence_rate: 0.33,
    cited_count: 1,
    retrieved_count: 1,
    missing_count: 2,
    sub_queries: [
      {
        query: "how to track AI brand mentions",
        status: "cited",
        retrieved: true,
        cited: true,
        rank: 2,
        avg_rank: 2,
        total_citations: 3,
        total_sources: 5,
        all_domains: ["promptwatch.com", "semrush.com", "g2.com"],
        winner: "promptwatch.com",
        matched_as: "promptwatch.com",
      },
      {
        query: "monitor ChatGPT brand mentions",
        status: "missing",
        retrieved: false,
        cited: false,
        rank: null,
        avg_rank: null,
        total_citations: 2,
        total_sources: 3,
        all_domains: ["semrush.com"],
        winner: "semrush.com",
        matched_as: null,
      },
      {
        query: "AI mention tracking tools",
        status: "missing",
        retrieved: false,
        cited: false,
        rank: null,
        avg_rank: null,
        total_citations: 1,
        total_sources: 2,
        all_domains: ["ahrefs.com"],
        winner: "ahrefs.com",
        matched_as: null,
      },
    ],
  },
];

const meta: Meta<typeof PromptTable> = {
  title: "Analytics/PromptTable",
  component: PromptTable,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof PromptTable>;

export const Mixed: Story = {
  args: {
    topics: sampleTopics,
    target: "promptwatch.com",
    defaultOpenFirst: true,
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-5xl p-6">
        <Story />
      </div>
    ),
  ],
};

export const AllMissing: Story = {
  args: {
    topics: [sampleTopics[0]],
    target: "promptwatch.com",
    defaultOpenFirst: true,
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-5xl p-6">
        <Story />
      </div>
    ),
  ],
};
