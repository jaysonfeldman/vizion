import type { Meta, StoryObj } from "@storybook/react";
import { StatStrip, Gauge, Quote, LayoutList } from "./StatStrip";

const meta: Meta<typeof StatStrip> = {
  title: "Analytics/StatStrip",
  component: StatStrip,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof StatStrip>;

export const Default: Story = {
  args: {
    stats: [
      {
        label: "Prompt score",
        value: "42",
        hint: "Moderate",
        progress: 0.42,
        tone: "warn",
        icon: Gauge,
      },
      {
        label: "Cited",
        value: "33%",
        hint: "10 of 30 searches",
        progress: 0.33,
        tone: "warn",
        icon: Quote,
      },
      {
        label: "Prompts covered",
        value: "2/6",
        hint: "Prompts where you were cited",
        progress: 0.33,
        tone: "warn",
        icon: LayoutList,
      },
    ],
  },
};

export const ZeroScore: Story = {
  args: {
    stats: [
      {
        label: "Prompt score",
        value: "0",
        hint: "Very low",
        progress: 0,
        tone: "bad",
        icon: Gauge,
      },
      {
        label: "Cited",
        value: "0%",
        hint: "0 of 12 searches",
        progress: 0,
        tone: "bad",
        icon: Quote,
      },
      {
        label: "Prompts covered",
        value: "0/6",
        hint: "Prompts where you were cited",
        progress: 0,
        tone: "bad",
        icon: LayoutList,
      },
    ],
  },
};
