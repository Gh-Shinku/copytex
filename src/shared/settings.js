(function registerCopyTeXSettings(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.CopyTeXSettings = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSettings() {
  const OUTPUT_FORMAT_STORAGE_KEY = "outputFormat";
  const DEFAULT_OUTPUT_FORMAT = "markdown";

  function normalizeOutputFormat(value) {
    return value === "latex" || value === "markdown" ? value : DEFAULT_OUTPUT_FORMAT;
  }

  function formatOutputFormatLabel(value) {
    return normalizeOutputFormat(value) === "latex" ? "LaTeX" : "Markdown";
  }

  return {
    DEFAULT_OUTPUT_FORMAT,
    OUTPUT_FORMAT_STORAGE_KEY,
    formatOutputFormatLabel,
    normalizeOutputFormat
  };
});
