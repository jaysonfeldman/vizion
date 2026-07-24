import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./input";

const meta: Meta<typeof Input> = {
  title: "UI/Input",
  component: Input,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Empty: Story = {
  args: { placeholder: "Enter a domain…" },
};

export const Filled: Story = {
  args: { defaultValue: "apple.com" },
};

export const Disabled: Story = {
  args: { defaultValue: "locked.com", disabled: true },
};

export const Invalid: Story = {
  args: {
    defaultValue: "not a url",
    "aria-invalid": true,
  },
};
