import type { OutputFormat } from "./types";

export const OUTPUT_FORMAT_STORAGE_KEY = "outputFormat";
export const DEFAULT_OUTPUT_FORMAT: OutputFormat = "markdown";

export function normalizeOutputFormat(value: unknown): OutputFormat {
  return value === "latex" || value === "markdown" ? value : DEFAULT_OUTPUT_FORMAT;
}

export function formatOutputFormatLabel(value: unknown): "Markdown" | "LaTeX" {
  return normalizeOutputFormat(value) === "latex" ? "LaTeX" : "Markdown";
}

export const settingsApi = {
  DEFAULT_OUTPUT_FORMAT,
  OUTPUT_FORMAT_STORAGE_KEY,
  formatOutputFormatLabel,
  normalizeOutputFormat
};

(globalThis as typeof globalThis & { CopyTeXSettings?: typeof settingsApi }).CopyTeXSettings =
  settingsApi;
