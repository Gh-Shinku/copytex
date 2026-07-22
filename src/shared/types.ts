export type OutputFormat = "markdown" | "latex";

export interface FormatOptions {
  outputFormat?: OutputFormat;
}

export interface FormulaExtractionResult {
  latex: string;
  displayMode: boolean;
  source: string;
}

export interface CopyResult {
  ok: boolean;
  text?: string;
  latex?: string;
  error?: string;
}

export interface SiteAdapter {
  id: string;
  matchesHost(hostname: string): boolean;
  applyDocumentMarkers?(document: Document): void;
}
