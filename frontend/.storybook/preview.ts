import type { Preview } from "@storybook/react";
import "../src/app/globals.css";

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    layout: "padded",
    options: {
      storySort: {
        order: [
          "Overview",
          "Foundation",
          "UI",
          "Analytics",
          "*",
        ],
      },
    },
    backgrounds: {
      default: "app",
      values: [
        { name: "app", value: "#f4f4f5" },
        { name: "white", value: "#ffffff" },
      ],
    },
  },
};

export default preview;
