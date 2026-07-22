const settings = globalThis.CopyTeXSettings;

const statusElement = document.getElementById("status");
const inputs = Array.from(document.querySelectorAll('input[name="outputFormat"]'));

chrome.storage.sync.get(
  { [settings.OUTPUT_FORMAT_STORAGE_KEY]: settings.DEFAULT_OUTPUT_FORMAT },
  (items) => {
    const value = settings.normalizeOutputFormat(
      items[settings.OUTPUT_FORMAT_STORAGE_KEY]
    );
    setCheckedValue(value);
  }
);

for (const input of inputs) {
  input.addEventListener("change", () => {
    if (!input.checked) {
      return;
    }

    const value = settings.normalizeOutputFormat(input.value);
    chrome.storage.sync.set({ [settings.OUTPUT_FORMAT_STORAGE_KEY]: value }, () => {
      showStatus("Saved");
    });
  });
}

function setCheckedValue(value) {
  for (const input of inputs) {
    input.checked = input.value === value;
  }
}

function showStatus(message) {
  statusElement.textContent = message;
  window.setTimeout(() => {
    if (statusElement.textContent === message) {
      statusElement.textContent = "";
    }
  }, 1200);
}
