import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ArrowRight, Plus, RefreshCw } from "lucide-react";

/**
 * Soft UI primitives used across Vizion (landing, prompts, results).
 * All controls below are interactive.
 */
function SoftUIGallery() {
  const [value, setValue] = useState("");
  const [prompt, setPrompt] = useState("Best smartphones for everyday use");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10 p-2">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-[-0.02em] text-black">
          Buttons
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="soft-cta inline-flex h-11 items-center gap-2 rounded-2xl px-5 text-sm font-medium"
          >
            Run analysis
            <ArrowRight className="size-4" />
          </button>
          <button
            type="button"
            className="soft-outline inline-flex h-11 items-center gap-2 rounded-2xl px-5 text-sm font-medium"
          >
            <RefreshCw className="size-3.5" />
            New analysis
          </button>
          <button
            type="button"
            disabled
            className="soft-cta inline-flex h-11 items-center gap-2 rounded-2xl px-5 text-sm font-medium"
          >
            Disabled CTA
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-1 py-1.5 text-sm text-black/40 transition hover:font-semibold hover:text-black"
          >
            <Plus className="size-3.5" strokeWidth={2.25} />
            Add a prompt
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-[-0.02em] text-black">
          Inputs
        </h2>
        <input
          className="soft-inset h-12 w-full rounded-2xl px-4 text-sm outline-none"
          placeholder="Enter a domain (soft inset)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="prompt-field flex items-center rounded-2xl">
          <input
            className="min-w-0 flex-1 bg-transparent px-3.5 py-3 text-sm outline-none placeholder:text-black/35"
            placeholder="Type a prompt…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-[-0.02em] text-black">
          Cards / surfaces
        </h2>
        <div className="soft-inset rounded-2xl p-5">
          <p className="text-sm font-medium text-black">Soft inset card</p>
          <p className="mt-1 text-sm text-black/50">
            Used for the metrics block and banner shell.
          </p>
        </div>
        <div className="soft-outline rounded-2xl p-5">
          <p className="text-sm font-medium text-black">Soft outline card</p>
          <p className="mt-1 text-sm text-black/50">
            Same family as buttons and the sources popup.
          </p>
        </div>
        <div className="soft-thumb h-40 overflow-hidden rounded-2xl">
          <div className="flex h-full items-center justify-center text-sm text-black/40">
            Soft thumb surface
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-[-0.02em] text-black">
          Status marks
        </h2>
        <div className="flex flex-wrap gap-6 text-sm">
          <span className="inline-flex items-center gap-1.5 text-emerald-600">
            <span className="text-base leading-none">✓</span> Cited
          </span>
          <span className="inline-flex items-center gap-1.5 text-amber-500">
            <span className="text-base leading-none">✓</span> Found
          </span>
          <span className="inline-flex items-center gap-1.5 text-neutral-300">
            <span className="text-base leading-none">–</span> Missing
          </span>
        </div>
      </section>
    </div>
  );
}

const meta: Meta = {
  title: "Foundation/Soft UI",
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj;

export const Gallery: Story = {
  render: () => <SoftUIGallery />,
};
