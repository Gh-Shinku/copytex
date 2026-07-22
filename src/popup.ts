import {
  DEFAULT_OUTPUT_FORMAT,
  OUTPUT_FORMAT_STORAGE_KEY,
  normalizeOutputFormat
} from "./shared/settings";

const statusElement = document.getElementById("status");
const inputs = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="outputFormat"]')
);

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

function setCheckedValue(value: string): void {
  for (const input of inputs) {
    input.checked = input.value === value;
  }
}

function showStatus(message: string): void {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message;
  window.setTimeout(() => {
    if (statusElement.textContent === message) {
      statusElement.textContent = "";
    }
  }, 1200);
}
