"use client";

import { useEffect, useState } from "react";
import spinners, { type BrailleSpinnerName } from "unicode-animations";
import { cn } from "@/lib/utils";

type UnicodeSpinnerProps = {
  name?: BrailleSpinnerName;
  className?: string;
  "aria-label"?: string;
};

/** Braille-dot unicode spinner (from unicode-animations). Default: rain. */
export function UnicodeSpinner({
  name = "rain",
  className,
  "aria-label": ariaLabel = "Loading",
}: UnicodeSpinnerProps) {
  const spinner = spinners[name] ?? spinners.rain;
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % spinner.frames.length);
    }, spinner.interval);
    return () => clearInterval(timer);
  }, [spinner.frames.length, spinner.interval]);

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={cn(
        "inline-block select-none font-mono text-[0.95rem] leading-none tracking-tight text-sky-700",
        className
      )}
    >
      {spinner.frames[frame]}
    </span>
  );
}
