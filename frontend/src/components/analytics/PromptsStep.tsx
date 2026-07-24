"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowLeft, Globe, Plus, Trash2 } from "lucide-react";
import { GeneratedPrompt } from "@/lib/types";
import { brandIconUrl } from "@/lib/demo-test";
import { cn, formatPromptLabel } from "@/lib/utils";

interface PromptsStepProps {
  prompts: GeneratedPrompt[];
  onConfirm: (selectedPrompts: GeneratedPrompt[]) => void;
  onBack: () => void;
  domain?: string;
  loading?: boolean;
  confirming?: boolean;
}

function domainIconUrl(domain: string): string {
  return brandIconUrl(domain, 128);
}

function mapPrompt(p: GeneratedPrompt): GeneratedPrompt {
  const prompt = formatPromptLabel(p.prompt);
  return { ...p, prompt, queries: [prompt] };
}

function emptyDrafts(count = 3): GeneratedPrompt[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    id: `draft-${now}-${i}`,
    prompt: "",
    category: "Custom",
    selected: true,
    queries: [""],
  }));
}

/** Keep user-typed rows; fill / append AI suggestions around them. */
function mergeIncoming(
  prev: GeneratedPrompt[],
  incoming: GeneratedPrompt[]
): GeneratedPrompt[] {
  if (!incoming.length) {
    return prev.length > 0 ? prev : emptyDrafts(3);
  }

  const mapped = incoming.map(mapPrompt);
  const userFilled = prev.filter((p) => p.prompt.trim().length > 0);

  if (userFilled.length === 0) {
    return mapped;
  }

  const seen = new Set(
    userFilled.map((p) => p.prompt.trim().toLowerCase())
  );
  const extras = mapped.filter(
    (p) => !seen.has(p.prompt.trim().toLowerCase())
  );
  return [...userFilled, ...extras];
}

export default function PromptsStep({
  prompts,
  onConfirm,
  onBack,
  domain,
  loading = false,
  confirming = false,
}: PromptsStepProps) {
  const [items, setItems] = useState<GeneratedPrompt[]>(() =>
    prompts.length > 0 ? prompts.map(mapPrompt) : emptyDrafts(3)
  );
  const [iconFailed, setIconFailed] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const focusedOnce = useRef(false);

  useEffect(() => {
    setItems((prev) => mergeIncoming(prev, prompts));
  }, [prompts]);

  useEffect(() => {
    setIconFailed(false);
  }, [domain]);

  // Let people start typing immediately while suggestions load
  useEffect(() => {
    if (focusedOnce.current || confirming) return;
    focusedOnce.current = true;
    const t = window.setTimeout(() => firstInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [confirming]);

  const updatePrompt = (id: string, text: string) => {
    setItems((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, prompt: text, queries: [text] } : p
      )
    );
  };

  const polishPrompt = (id: string) => {
    setItems((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const prompt = formatPromptLabel(p.prompt);
        return { ...p, prompt, queries: [prompt] };
      })
    );
  };

  const remove = (id: string) => {
    setItems((prev) => {
      const next = prev.filter((p) => p.id !== id);
      return next.length > 0 ? next : emptyDrafts(1);
    });
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
    .map((p) => {
      const prompt = formatPromptLabel(p.prompt);
      return { ...p, prompt, queries: [prompt], selected: true };
    })
    .filter((p) => p.prompt.length > 0);

  // Only block submit while the analysis confirm hop is in flight —
  // suggestions can keep loading in the background.
  const canSubmit = ready.length >= 1 && !confirming;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col pb-10">
      <div className="mb-8">
        {domain && !iconFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={domainIconUrl(domain)}
            alt=""
            className="mb-5 size-12 overflow-hidden rounded-lg object-contain sm:size-14"
            onError={() => setIconFailed(true)}
          />
        ) : (
          <Globe className="mb-5 size-12 text-black/35 sm:size-14" />
        )}
        <h2 className="font-display text-2xl font-semibold tracking-[-0.035em] text-black sm:text-3xl">
          Prompts to monitor
        </h2>
        <p className="mt-2 max-w-md text-[15px] leading-snug tracking-[-0.01em] text-black/70">
          Ranking questions buyers ask AI about{" "}
          <span className="text-black">{domain || "your niche"}</span>.
          {loading ? (
            <span className="mt-1 block text-black/45">
              Suggesting prompts… you can type your own anytime.
            </span>
          ) : null}
        </p>
      </div>

      <p className="mb-3 text-sm font-medium tracking-[-0.01em] text-black">
        What do you want to monitor?
      </p>

      <div className="space-y-2.5">
        {items.map((prompt, index) => (
          <div
            key={prompt.id}
            className={cn(
              "prompt-field group relative flex items-center rounded-2xl",
              loading && !prompt.prompt.trim() && "opacity-90"
            )}
          >
            <input
              ref={index === 0 ? firstInputRef : undefined}
              type="text"
              value={prompt.prompt}
              onChange={(e) => updatePrompt(prompt.id, e.target.value)}
              onBlur={() => polishPrompt(prompt.id)}
              placeholder={
                loading && !prompt.prompt.trim()
                  ? "Type a prompt, or wait for suggestions…"
                  : "e.g. Best note taking app for startups"
              }
              disabled={confirming}
              className={cn(
                "min-w-0 flex-1 bg-transparent px-3.5 py-3 pr-10 text-sm leading-snug tracking-[-0.01em] text-black outline-none placeholder:text-black/35 disabled:opacity-60"
              )}
            />
            <button
              type="button"
              onClick={() => remove(prompt.id)}
              disabled={confirming}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-black/25 opacity-0 transition hover:bg-black/5 hover:text-rose-600 group-hover:opacity-100 group-focus-within:opacity-100 disabled:pointer-events-none"
              aria-label="Remove prompt"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addPrompt}
        disabled={confirming}
        className="mt-3 inline-flex items-center gap-1.5 self-start px-1 py-1.5 text-sm tracking-[-0.01em] text-black/40 transition hover:font-semibold hover:text-black disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="size-3.5" strokeWidth={2.25} />
        Add a prompt
      </button>

      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={confirming}
          className="soft-outline inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-medium tracking-[-0.015em] disabled:cursor-not-allowed"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <button
          type="button"
          onClick={() => onConfirm(ready)}
          disabled={!canSubmit}
          className="soft-cta inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-medium tracking-[-0.015em]"
        >
          {confirming ? "Finishing…" : "Run analysis"}
          {!confirming && <ArrowRight className="size-4" />}
        </button>
      </div>
    </div>
  );
}
