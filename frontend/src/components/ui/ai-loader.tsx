"use client";

import { cn } from "@/lib/utils";

const LETTERS = ["G", "e", "n", "e", "r", "a", "t", "i", "n", "g"] as const;

export function Component({ className }: { className?: string }) {
  return (
    <div className={cn("loader-wrapper", className)} aria-hidden>
      {LETTERS.map((letter, i) => (
        <span key={`${letter}-${i}`} className="loader-letter">
          {letter}
        </span>
      ))}
      <div className="loader" />
    </div>
  );
}

export { Component as AiLoader };
