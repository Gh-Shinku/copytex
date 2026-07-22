const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEFAULT_OUTPUT_FORMAT,
  OUTPUT_FORMAT_STORAGE_KEY,
  formatOutputFormatLabel,
  normalizeOutputFormat
} = require("../.test-build/shared/settings.cjs");

test("settings expose output format storage defaults", () => {
  assert.equal(OUTPUT_FORMAT_STORAGE_KEY, "outputFormat");
  assert.equal(DEFAULT_OUTPUT_FORMAT, "markdown");
});

test("settings normalize supported output formats", () => {
  assert.equal(normalizeOutputFormat("markdown"), "markdown");
  assert.equal(normalizeOutputFormat("latex"), "latex");
  assert.equal(normalizeOutputFormat("dollar"), "markdown");
});

test("settings format output labels", () => {
  assert.equal(formatOutputFormatLabel("markdown"), "Markdown");
  assert.equal(formatOutputFormatLabel("latex"), "LaTeX");
  assert.equal(formatOutputFormatLabel("unknown"), "Markdown");
});
