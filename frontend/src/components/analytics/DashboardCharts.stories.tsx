import type { Meta, StoryObj } from "@storybook/react";
import {
  OutcomeMiniDonut,
  PromptVisibilityBars,
  ScoreMiniGauge,
} from "./DashboardCharts";

const meta: Meta = {
  title: "Analytics/DashboardCharts",
  tags: ["autodocs"],
};

export default meta;

export const ScoreGauge: StoryObj = {
  render: () => <ScoreMiniGauge score={0} />,
};

export const ScoreGaugeMid: StoryObj = {
  render: () => <ScoreMiniGauge score={48} />,
};

export const OutcomeDonut: StoryObj = {
  render: () => (
    <OutcomeMiniDonut
      kpis={{
        citation_rate: 0.1,
        presence_rate: 0.2,
        avg_rank: 2,
        share_of_voice: 0.05,
        sample_size: 18,
        cited_count: 2,
        retrieved_count: 4,
        missing_count: 14,
        topic_count: 6,
      }}
    />
  ),
};

export const VisibilityBars: StoryObj = {
  render: () => (
    <div className="w-[360px]">
      <PromptVisibilityBars
        items={[
          { label: "best AI visibility tools", value: 0 },
          { label: "how to track AI mentions", value: 0.33 },
          { label: "AI brand monitoring tools", value: 0.15 },
        ]}
      />
    </div>
  ),
};
