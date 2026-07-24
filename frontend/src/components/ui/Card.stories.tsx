import type { Meta, StoryObj } from "@storybook/react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";
import { Button } from "./button";

const meta: Meta = {
  title: "UI/Card",
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Visibility</CardTitle>
        <CardDescription>How often AI names your brand.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight">72%</p>
      </CardContent>
      <CardFooter>
        <Button size="sm">View details</Button>
      </CardFooter>
    </Card>
  ),
};

export const WithAction: Story = {
  render: () => (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Competitors</CardTitle>
        <CardDescription>Who else shows up in AI answers.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            Export
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          <li>medium.com — 36%</li>
          <li>reddit.com — 32%</li>
          <li>g2.com — 28%</li>
        </ul>
      </CardContent>
    </Card>
  ),
};
