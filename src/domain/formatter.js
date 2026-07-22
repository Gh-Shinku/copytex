(function registerCopyTeXFormatter(root, factory) {
  let settings = root.CopyTeXSettings;

  if (!settings && typeof require === "function") {
    try {
      settings = require("../shared/settings");
    } catch (_error) {
      settings = null;
    }
  }

  const api = factory(settings);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.CopyTeXFormatter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createFormatter(settings) {
  const DEFAULT_OUTPUT_FORMAT = settings
    ? settings.DEFAULT_OUTPUT_FORMAT
    : "markdown";

  function formatFormula(extracted, options) {
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

  function formatFormulaForSelection(extracted, options) {
    const text = formatFormula(extracted, options);
    if (extracted && extracted.displayMode && text) {
      return `\n${text}\n`;
    }

    return text;
  }

  function normalizeOutputOptions(options) {
    const outputFormat = options && options.outputFormat;

    return {
      outputFormat:
        settings && typeof settings.normalizeOutputFormat === "function"
          ? settings.normalizeOutputFormat(outputFormat)
          : fallbackNormalizeOutputFormat(outputFormat)
    };
  }

  function fallbackNormalizeOutputFormat(value) {
    return value === "latex" || value === "markdown" ? value : DEFAULT_OUTPUT_FORMAT;
  }

  return {
    formatFormula,
    formatFormulaForSelection,
    normalizeOutputOptions
  };
});
