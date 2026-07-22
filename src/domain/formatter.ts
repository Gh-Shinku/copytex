import { normalizeOutputFormat } from "../shared/settings";
import type {
  FormatOptions,
  FormulaExtractionResult,
  OutputFormat
} from "../shared/types";

export function formatFormula(
  extracted: FormulaExtractionResult | null | undefined,
  options?: FormatOptions
): string {
  if (!extracted || !extracted.latex) {
    return "";
  }

  const normalizedOptions = normalizeOutputOptions(options);

  if (extracted.displayMode) {
    if (normalizedOptions.outputFormat === "latex") {
      return `\\[\n${extracted.latex}\n\\]`;
    }

    return `$$\n${extracted.latex}\n$$`;
  }

  if (normalizedOptions.outputFormat === "latex") {
    return `\\(${extracted.latex}\\)`;
  }

  return `$${extracted.latex}$`;
}

export function formatFormulaForSelection(
  extracted: FormulaExtractionResult | null | undefined,
  options?: FormatOptions
): string {
  const text = formatFormula(extracted, options);
  if (extracted && extracted.displayMode && text) {
    return `\n${text}\n`;
  }

  return text;
}

export function normalizeOutputOptions(
  options?: FormatOptions
): { outputFormat: OutputFormat } {
  return {
    outputFormat: normalizeOutputFormat(options && options.outputFormat)
  };
}

export const formatterApi = {
  formatFormula,
  formatFormulaForSelection,
  normalizeOutputOptions
};

(globalThis as typeof globalThis & { CopyTeXFormatter?: typeof formatterApi }).CopyTeXFormatter =
  formatterApi;
