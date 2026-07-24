"use client";

import { useEffect, useState, type SVGProps } from "react";

/** 6 wide × 3 tall */
export const WAVE_COLS = 6;
export const WAVE_ROWS = 3;

const PAD = 7;
const SPACING = 12;
const VIEW_W = PAD * 2 + SPACING * (WAVE_COLS - 1);
const VIEW_H = PAD * 2 + SPACING * (WAVE_ROWS - 1);
const DOT_R = 3.1;

export const WAVE_BLUE = "#2563eb";
/** Solid idle color — off dots stay fully opaque, never half-faded. */
const OFF_FILL = "#dbe4f0";

export type DotLoaderVariant = "wave" | "scan";

export interface WaveDotLoaderProps
  extends Omit<SVGProps<SVGSVGElement>, "color" | "width" | "height"> {
  /** Visual height in px; width scales with the 6×3 aspect. */
  size?: number;
  color?: string;
  baseColor?: string;
  autoPlay?: boolean;
  /** 0.5 = half speed, 2 = 2× faster. */
  speedMultiplier?: number;
  /** wave = sine crest; scan = bouncing scanner bar */
  variant?: DotLoaderVariant;
}

type ScanLevel = "off" | "soft" | "hard";

/** Blend hex color toward white for the scanner soft trail. */
function lighten(hex: string, amount: number): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return hex;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Two-dot crest: for each column, light the nearest row to the sine value
 * plus its neighbor — always two dots thick.
 */
function isWaveLit(col: number, row: number, phase: number): boolean {
  const y = Math.sin(phase * 2.2 + col * ((2 * Math.PI) / WAVE_COLS));
  const crest = ((y + 1) / 2) * (WAVE_ROWS - 1);
  const primary = Math.round(crest);
  const secondary =
    crest >= primary
      ? Math.min(primary + 1, WAVE_ROWS - 1)
      : Math.max(primary - 1, 0);
  const pair =
    secondary === primary
      ? primary === 0
        ? 1
        : primary - 1
      : secondary;
  return row === primary || row === pair;
}

const SCAN_HARD_RADIUS = 0.5;
const SCAN_LEAD_RADIUS = 0.75;
const SCAN_TRAIL_RADIUS = 2.1;

/**
 * Scanner head using a sine so it eases at both ends and reverses
 * (left→right→left). Travels far enough past the edges that every lit
 * column (hard + soft) is fully off-grid before turning around.
 */
function scanHead(phase: number): number {
  const t = (Math.sin(phase) + 1) / 2; // 0 → 1 → 0, slow at the extremes
  const overhang = SCAN_TRAIL_RADIUS;
  const min = -overhang;
  const max = WAVE_COLS - 1 + overhang;
  return min + t * (max - min);
}

/** +1 while sweeping right, -1 while sweeping left. */
function scanDirection(phase: number): 1 | -1 {
  return Math.cos(phase) >= 0 ? 1 : -1;
}

/**
 * Irregular scanner: still left↔right overall, but rows lag each other,
 * the soft trail stretches behind the motion, and a light wobble keeps
 * the beam from reading as a rigid bar.
 */
function scanLevel(col: number, row: number, phase: number): ScanLevel {
  const dir = scanDirection(phase);
  // Stagger rows so the beam is slightly diagonal / uneven.
  const rowLag = (row - 1) * 0.42 * dir;
  // Small per-row wobble — irregular but deterministic.
  const wobble = Math.sin(phase * 3.1 + row * 2.3 + col * 0.15) * 0.28;
  const head = scanHead(phase) + rowLag + wobble;

  const offset = col - head; // negative = left of head
  const behind = -dir * offset; // >0 = in the trailing direction
  const ahead = -behind;

  if (Math.abs(offset) < SCAN_HARD_RADIUS) return "hard";
  // Longer soft wake behind, thinner soft tip ahead.
  if (behind > 0 && behind < SCAN_TRAIL_RADIUS) return "soft";
  if (ahead > 0 && ahead < SCAN_LEAD_RADIUS) return "soft";
  return "off";
}

export function WaveDotLoader({
  size = 56,
  color = WAVE_BLUE,
  baseColor = OFF_FILL,
  autoPlay = true,
  speedMultiplier = 1,
  variant = "wave",
  style,
  className,
  ...props
}: WaveDotLoaderProps) {
  const [phase, setPhase] = useState(0);
  const speed = speedMultiplier > 0 ? speedMultiplier : 1;
  const width = Math.round(size * (VIEW_W / VIEW_H));
  const softColor = lighten(color, 0.55);

  useEffect(() => {
    if (!autoPlay) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let frame = 0;
    let last = performance.now();
    // Scan phase feeds Math.sin — higher rate = snappier bounce.
    const rate = variant === "scan" ? 3.2 : 0.9;

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setPhase((p) => p + dt * rate * speed);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [autoPlay, speed, variant]);

  const dots = [];
  for (let row = 0; row < WAVE_ROWS; row++) {
    for (let col = 0; col < WAVE_COLS; col++) {
      let fill = baseColor;

      if (variant === "scan") {
        const level = scanLevel(col, row, phase);
        if (level === "hard") fill = color;
        else if (level === "soft") fill = softColor;
      } else if (isWaveLit(col, row, phase)) {
        fill = color;
      }

      dots.push(
        <circle
          key={`${row}-${col}`}
          cx={PAD + col * SPACING}
          cy={PAD + row * SPACING}
          r={DOT_R}
          fill={fill}
        />,
      );
    }
  }

  const label =
    variant === "scan" ? "Scan loading indicator" : "Wave loading indicator";
  const title = variant === "scan" ? "Scan loader" : "Wave loader";
  const desc =
    variant === "scan"
      ? "A 6 by 3 grid with an irregular soft-hard scanner beam sweeping left to right and back."
      : "A 6 by 3 grid where a two-dot line forms a pulsing sine wave. Each dot is fully on or off.";

  return (
    <svg
      aria-label={label}
      role="img"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width={width}
      height={size}
      className={className}
      style={style}
      {...props}
    >
      <title>{title}</title>
      <desc>{desc}</desc>
      {dots}
    </svg>
  );
}
