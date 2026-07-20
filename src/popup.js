const DISPLAY_DELIMITER_STORAGE_KEY = "displayDelimiter";
const DEFAULT_DISPLAY_DELIMITER = "bracket";

const statusElement = document.getElementById("status");
const inputs = Array.from(document.querySelectorAll('input[name="displayDelimiter"]'));

chrome.storage.sync.get(
  { [DISPLAY_DELIMITER_STORAGE_KEY]: DEFAULT_DISPLAY_DELIMITER },
  (items) => {
    const value = normalizeDisplayDelimiter(items[DISPLAY_DELIMITER_STORAGE_KEY]);
    setCheckedValue(value);
  }
);

for (const input of inputs) {
  input.addEventListener("change", () => {
    if (!input.checked) {
      return;
    }

    const value = normalizeDisplayDelimiter(input.value);
    chrome.storage.sync.set({ [DISPLAY_DELIMITER_STORAGE_KEY]: value }, () => {
      showStatus("Saved");
    });
  });
}

function setCheckedValue(value) {
  for (const input of inputs) {
    input.checked = input.value === value;
  }
}

function normalizeDisplayDelimiter(value) {
  return value === "dollar" || value === "bracket" ? value : DEFAULT_DISPLAY_DELIMITER;
}

function showStatus(message) {
  statusElement.textContent = message;
  window.setTimeout(() => {
    if (statusElement.textContent === message) {
      statusElement.textContent = "";
    }
  }, 1200);
}
