import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const QUESTION_START =
  /^(how|what|which|why|when|where|who|whom|whose|do|does|did|is|are|was|were|can|could|should|would|will|may|might|am|have|has|had)\b/i

/** Capitalize the first letter; add "?" when the prompt reads as a question. */
export function formatPromptLabel(raw: string): string {
  let t = raw.replace(/\s+/g, " ").trim().replace(/[?.!]+$/, "")
  if (!t) return ""
  t = t.charAt(0).toUpperCase() + t.slice(1)
  if (QUESTION_START.test(t)) t += "?"
  return t
}
