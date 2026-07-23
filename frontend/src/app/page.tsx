"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EXAMPLES = [
  { domain: "stripe.com", label: "Stripe" },
  { domain: "notion.so", label: "Notion" },
  { domain: "linear.app", label: "Linear" },
] as const;

export default function Home() {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [url, setUrl] = useState("");
  const router = useRouter();

  useEffect(() => {
    router.prefetch("/analytics");
    for (const ex of EXAMPLES) {
      const img = new Image();
      img.decoding = "async";
      img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(ex.domain)}&sz=64`;
      // Warm site meta for example brands
      void fetch(`/api/site-meta?domain=${encodeURIComponent(ex.domain)}`).catch(
        () => {}
      );
    }
  }, [router]);

  const handleUrlSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const host = trimmed
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .split("/")[0];
    // Start warming assets before navigation
    void fetch(`/api/site-meta?domain=${encodeURIComponent(host)}`).catch(
      () => {}
    );
    const fav = new Image();
    fav.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;

    setIsTransitioning(true);
    setTimeout(() => {
      router.push(`/analytics?url=${encodeURIComponent(trimmed)}`);
    }, 180);
  };

  return (
    <div
      className={`relative flex min-h-screen w-full items-center justify-center overflow-hidden transition-opacity duration-300 ${
        isTransitioning ? "opacity-0" : "opacity-100"
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, oklch(0.94 0.02 250), transparent 55%), radial-gradient(ellipse 50% 40% at 100% 80%, oklch(0.95 0.015 180), transparent 50%), oklch(0.985 0.002 260)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")",
        }}
      />

      <main className="relative z-10 flex w-full max-w-lg flex-col items-center px-6 py-16 text-center">
        <h1 className="font-display text-4xl leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl">
          See who AI recommends
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-neutral-500">
          Enter a site to see if AI search names the brand.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleUrlSubmit(url);
          }}
          className="mt-10 flex w-full flex-col gap-3 sm:flex-row"
        >
          <Input
            name="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="yourcompany.com"
            className="h-12 flex-1 rounded-xl border-neutral-200 bg-white/90 text-base shadow-sm"
            autoComplete="off"
            autoFocus
          />
          <Button
            type="submit"
            className="h-12 rounded-xl px-6 text-base"
            disabled={!url.trim()}
          >
            Try it
          </Button>
        </form>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-neutral-400">Try a known brand:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.domain}
              type="button"
              onClick={() => handleUrlSubmit(ex.domain)}
              className="rounded-full border border-neutral-200 bg-white/80 px-3 py-1 text-xs text-neutral-700 transition hover:border-neutral-300 hover:bg-white"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
