import type { Meta, StoryObj } from "@storybook/react";
import { MentionsStack } from "./MentionsStack";

const meta: Meta<typeof MentionsStack> = {
  title: "Analytics/MentionsStack",
  component: MentionsStack,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof MentionsStack>;

export const Competitors: Story = {
  args: {
    target: "promptwatch.com",
    domains: [
      "semrush.com",
      "ahrefs.com",
      "g2.com",
      "hubspot.com",
      "peec.ai",
    ],
  },
};

export const IncludesYou: Story = {
  args: {
    target: "promptwatch.com",
    domains: ["promptwatch.com", "semrush.com", "g2.com"],
  },
};

export const Empty: Story = {
  args: {
    target: "promptwatch.com",
    domains: [],
  },
};
