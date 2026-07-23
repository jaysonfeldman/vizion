import type { Preview } from "@storybook/react";
import "../src/app/globals.css";

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    layout: "padded",
    backgrounds: {
      default: "app",
      values: [
        { name: "app", value: "oklch(0.985 0.002 260)" },
        { name: "white", value: "#ffffff" },
      ],
    },
  },
};

export default preview;
