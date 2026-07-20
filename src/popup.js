const OUTPUT_FORMAT_STORAGE_KEY = "outputFormat";
const DEFAULT_OUTPUT_FORMAT = "markdown";

const statusElement = document.getElementById("status");
const inputs = Array.from(document.querySelectorAll('input[name="outputFormat"]'));

chrome.storage.sync.get(
  { [OUTPUT_FORMAT_STORAGE_KEY]: DEFAULT_OUTPUT_FORMAT },
  (items) => {
    const value = normalizeOutputFormat(items[OUTPUT_FORMAT_STORAGE_KEY]);
    setCheckedValue(value);
  }
);

for (const input of inputs) {
  input.addEventListener("change", () => {
    if (!input.checked) {
      return;
    }

    const value = normalizeOutputFormat(input.value);
    chrome.storage.sync.set({ [OUTPUT_FORMAT_STORAGE_KEY]: value }, () => {
      showStatus("Saved");
    });
  });
}

function setCheckedValue(value) {
  for (const input of inputs) {
    input.checked = input.value === value;
  }
}

function normalizeOutputFormat(value) {
  return value === "latex" || value === "markdown" ? value : DEFAULT_OUTPUT_FORMAT;
}

function showStatus(message) {
  statusElement.textContent = message;
  window.setTimeout(() => {
    if (statusElement.textContent === message) {
      statusElement.textContent = "";
    }
  }, 1200);
}
