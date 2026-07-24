import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { MentionsStack } from "./MentionsStack";
import type { MentionSource } from "@/lib/types";

const sampleSources: MentionSource[] = [
  {
    domain: "medium.com",
    url: "https://medium.com/@example/article",
    title: "Medium",
  },
  {
    domain: "reddit.com",
    url: "https://reddit.com/r/apple",
    title: "Reddit",
  },
  {
    domain: "g2.com",
    url: "https://www.g2.com/products/example",
    title: "G2",
  },
  {
    domain: "youtube.com",
    url: "https://youtube.com/watch?v=abc",
    title: "YouTube",
  },
  {
    domain: "apple.com",
    url: "https://www.apple.com",
    title: "Apple",
    is_you: true,
  },
];

const meta: Meta<typeof MentionsStack> = {
  title: "Analytics/MentionsStack",
  component: MentionsStack,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Source favicon stack. Click to open the ranked-mentions popup (soft shadow, no border).",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof MentionsStack>;

export const Closed: Story = {
  args: {
    target: "apple.com",
    sources: sampleSources,
    provider: "gemini",
    model: "gemini-flash-latest",
  },
};

export const OpenPopup: Story = {
  args: {
    target: "apple.com",
    sources: sampleSources,
    provider: "chatgpt",
    model: "gpt-4o-mini",
    defaultOpen: true,
  },
};

export const IncludesYou: Story = {
  args: {
    target: "apple.com",
    sources: sampleSources,
    provider: "gemini",
    model: "gemini-flash-latest",
    defaultOpen: true,
  },
};

export const Interactive: Story = {
  render: () => {
    const [key, setKey] = useState(0);
    return (
      <div className="space-y-4 p-6">
        <p className="text-sm text-black/50">
          Click the favicon stack to open/close the popup.
        </p>
        <MentionsStack
          key={key}
          target="apple.com"
          sources={sampleSources}
          provider="gemini"
          model="gemini-flash-latest"
        />
        <button
          type="button"
          className="soft-outline rounded-lg px-3 py-1.5 text-sm"
          onClick={() => setKey((k) => k + 1)}
        >
          Reset
        </button>
      </div>
    );
  },
};

export const Empty: Story = {
  args: {
    target: "apple.com",
    domains: [],
  },
};
