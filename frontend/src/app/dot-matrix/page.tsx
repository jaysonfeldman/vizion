"use client";

import { useState } from "react";
import {
  WAVE_BLUE,
  WaveDotLoader,
  type DotLoaderVariant,
} from "@/components/dot-matrix/WaveDotLoader";

const VARIANTS: {
  id: DotLoaderVariant;
  title: string;
  blurb: string;
}[] = [
  {
    id: "wave",
    title: "Crest wave",
    blurb: "Two-dot sine crest waving across the grid.",
  },
  {
    id: "scan",
    title: "Scan",
    blurb: "Irregular left↔right scan with a trailing soft wake.",
  },
];

const HEIGHTS = [40, 64, 96] as const;

export default function DotMatrixDemoPage() {
  const [variant, setVariant] = useState<DotLoaderVariant>("scan");
  const [height, setHeight] = useState<(typeof HEIGHTS)[number]>(64);
  const [color, setColor] = useState(WAVE_BLUE);
  const [speed, setSpeed] = useState(1);

  const active = VARIANTS.find((item) => item.id === variant) ?? VARIANTS[0];

  return (
    <main className="min-h-screen bg-[#f6f4ef] text-slate-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-12">
        <header className="flex flex-col gap-3">
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
            Custom loader
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">
            6×3 dot loaders
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-slate-600">
            Binary on/off dots on a 6×3 grid — crest wave or left-to-right scan.
          </p>
        </header>

        <section className="grid gap-8 md:grid-cols-[1fr_240px]">
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-6 rounded-2xl border border-slate-200/80 bg-white p-10 shadow-sm">
            <WaveDotLoader
              variant={variant}
              size={height}
              color={color}
              speedMultiplier={speed}
            />
            <div className="space-y-1 text-center">
              <h2 className="text-xl font-semibold">{active.title}</h2>
              <p className="text-sm text-slate-500">{active.blurb}</p>
              <p className="font-mono text-xs text-slate-400">
                6×3 · {variant} · {speed.toFixed(1)}×
              </p>
            </div>
          </div>

          <aside className="flex flex-col gap-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <div className="space-y-2">
              <p className="text-sm text-slate-600">Variant</p>
              <div className="flex flex-col gap-2">
                {VARIANTS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setVariant(item.id)}
                    className={`rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                      variant === item.id
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    <div className="font-medium">{item.title}</div>
                    <div
                      className={
                        variant === item.id ? "text-blue-100" : "text-slate-500"
                      }
                    >
                      {item.blurb}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-2 text-sm text-slate-600">
              Color
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-full cursor-pointer rounded-md border border-slate-200 bg-white"
              />
            </label>

            <div className="flex flex-col gap-2 text-sm text-slate-600">
              Height
              <div className="flex gap-2">
                {HEIGHTS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setHeight(value)}
                    className={`flex-1 rounded-md border px-2 py-2 text-sm transition ${
                      height === value
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    {value}px
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-2 text-sm text-slate-600">
              Speed ({speed.toFixed(1)}×)
              <input
                type="range"
                min={0.5}
                max={2.5}
                step={0.1}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
            </label>
          </aside>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Both variants</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {VARIANTS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setVariant(item.id)}
                className={`flex flex-col items-center gap-4 rounded-xl border px-4 py-6 transition ${
                  variant === item.id
                    ? "border-blue-600 bg-white shadow-sm"
                    : "border-slate-200/80 bg-white/70 hover:border-slate-400 hover:bg-white"
                }`}
              >
                <WaveDotLoader
                  variant={item.id}
                  size={48}
                  color={color}
                  speedMultiplier={speed}
                />
                <div className="text-center">
                  <div className="text-sm font-medium">{item.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.blurb}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
