"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft, Globe, Plus, Trash2 } from "lucide-react";
import { GeneratedPrompt } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PromptsStepProps {
  prompts: GeneratedPrompt[];
  onConfirm: (selectedPrompts: GeneratedPrompt[]) => void;
  onBack: () => void;
  domain?: string;
  loading?: boolean;
  confirming?: boolean;
}

function domainIconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

export default function PromptsStep({
  prompts,
  onConfirm,
  onBack,
  domain,
  loading = false,
  confirming = false,
}: PromptsStepProps) {
  const [items, setItems] = useState<GeneratedPrompt[]>(prompts);
  const [iconFailed, setIconFailed] = useState(false);

  useEffect(() => {
    setItems(prompts);
  }, [prompts]);

  useEffect(() => {
    setIconFailed(false);
  }, [domain]);

  const updatePrompt = (id: string, text: string) => {
    setItems((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, prompt: text, queries: [text] } : p
      )
    );
  };

  const remove = (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
  };

  const addPrompt = () => {
    const id = `custom-${Date.now()}`;
    setItems((prev) => [
      ...prev,
      {
        id,
        prompt: "",
        category: "Custom",
        selected: true,
        queries: [""],
      },
    ]);
  };

  const ready = items
    .map((p) => ({ ...p, prompt: p.prompt.trim(), selected: true }))
    .filter((p) => p.prompt.length > 0);

  const busy = loading || confirming;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col pb-10">
      <div className="mb-8">
        {domain && !iconFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={domainIconUrl(domain)}
            alt=""
            className="mb-5 size-9 rounded-lg bg-white object-contain p-1.5 ring-1 ring-neutral-200"
            onError={() => setIconFailed(true)}
          />
        ) : (
          <div className="mb-5 flex size-9 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400 ring-1 ring-neutral-200">
            <Globe className="size-4" />
          </div>
        )}
        <h2 className="font-display text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
          Prompts to monitor
        </h2>
        <p className="mt-2 max-w-md text-[15px] leading-snug text-black/60">
          Ranking questions buyers ask AI about{" "}
          <span className="text-black/80">{domain || "your niche"}</span>.
        </p>
      </div>

      <p className="mb-3 text-sm font-medium text-neutral-800">
        What do you want to monitor?
      </p>

      <div className="space-y-2.5">
        {loading && items.length === 0
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={`skel-${i}`}
                className="h-[42px] animate-pulse rounded-xl border border-neutral-200 bg-neutral-100/80"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))
          : items.map((prompt) => (
              <div
                key={prompt.id}
                className="group relative flex items-center rounded-xl border border-neutral-200 bg-white shadow-sm transition focus-within:border-neutral-300"
              >
                <input
                  type="text"
                  value={prompt.prompt}
                  onChange={(e) => updatePrompt(prompt.id, e.target.value)}
                  placeholder="e.g. best note taking app for startups"
                  disabled={confirming}
                  className={cn(
                    "min-w-0 flex-1 bg-transparent px-3.5 py-2.5 pr-10 text-sm leading-snug text-neutral-900 outline-none placeholder:text-neutral-400 disabled:opacity-60"
                  )}
                />
                <button
                  type="button"
                  onClick={() => remove(prompt.id)}
                  disabled={confirming}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-neutral-300 opacity-0 transition hover:bg-neutral-50 hover:text-rose-600 group-hover:opacity-100 group-focus-within:opacity-100 disabled:pointer-events-none"
                  aria-label="Remove prompt"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
      </div>

      <button
        type="button"
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 py-2.5 text-sm text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-700 disabled:opacity-50"
        onClick={addPrompt}
        disabled={busy}
      >
        <Plus className="size-4" />
        Add a prompt
      </button>

      <div className="mt-8 flex gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          className="h-11 flex-1"
          disabled={confirming}
        >
          <ArrowLeft className="mr-2 size-4" />
          Back
        </Button>
        <Button
          onClick={() => onConfirm(ready)}
          disabled={ready.length < 1 || busy}
          className="h-11 flex-1"
        >
          {confirming ? "Finishing…" : loading ? "Preparing…" : "Run analysis"}
          {!busy && <ArrowRight className="ml-2 size-4" />}
        </Button>
      </div>
    </div>
  );
}
