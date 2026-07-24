"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { DEMO_DOMAIN, brandIconUrl, isCannedDomain } from "@/lib/demo-test";

const EXAMPLES = [
  { domain: "clickup.com", label: "ClickUp" },
  { domain: "notion.so", label: "Notion" },
  { domain: "figma.com", label: "Figma" },
  /** Temporary free sandbox — no paid AI calls */
  { domain: DEMO_DOMAIN, label: "Demo" },
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
      img.src = brandIconUrl(ex.domain, 64);
    }
  }, [router]);

  const handleUrlSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const host = trimmed
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .split("/")[0];
    if (!isCannedDomain(host)) {
      void fetch(`/api/site-meta?domain=${encodeURIComponent(host)}`).catch(
        () => {}
      );
    }
    const fav = new Image();
    fav.src = brandIconUrl(host, 64);

    setIsTransitioning(true);
    setTimeout(() => {
      router.push(`/analytics?url=${encodeURIComponent(trimmed)}`);
    }, 180);
  };

  return (
    <div
      className={`relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#f4f4f5] transition-opacity duration-300 ${
        isTransitioning ? "opacity-0" : "opacity-100"
      }`}
    >
      <main className="relative z-10 flex w-full max-w-md flex-col items-center px-6 py-16 text-center">
        <h1 className="font-display text-5xl font-bold leading-[1.02] tracking-[-0.045em] text-black sm:text-6xl">
          Check your
          <br />
          AI visibility
        </h1>
        <p className="mt-4 max-w-sm text-[15px] leading-relaxed tracking-[-0.01em] text-black/80">
          Enter a site to see if AI search names the brand.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleUrlSubmit(url);
          }}
          className="mt-10 flex w-full flex-col gap-3"
        >
          <input
            name="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="yourcompany.com"
            autoComplete="off"
            autoFocus
            className="soft-inset w-full rounded-2xl px-5 text-base tracking-[-0.01em] text-black"
            style={{ height: "3.25rem" }}
          />
          <button
            type="submit"
            disabled={!url.trim()}
            className="soft-cta relative inline-flex w-full items-center justify-center rounded-2xl px-6 text-base font-medium tracking-[-0.015em]"
            style={{ height: "3.25rem" }}
          >
            Continue
            <ArrowRight
              className="absolute right-5 size-4"
              strokeWidth={2.25}
            />
          </button>
        </form>

        <div className="mt-7 flex w-full items-center gap-3">
          <div className="h-px flex-1 bg-black/10" />
          <span className="shrink-0 text-xs tracking-[-0.01em] text-black/40">
            Try a known brand
          </span>
          <div className="h-px flex-1 bg-black/10" />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.domain}
              type="button"
              onClick={() => handleUrlSubmit(ex.domain)}
              className="soft-inset inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-xs font-medium tracking-[-0.01em] text-black"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={brandIconUrl(ex.domain, 32)}
                alt=""
                width={14}
                height={14}
                className="size-3.5 rounded-[3px]"
              />
              {ex.label}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
