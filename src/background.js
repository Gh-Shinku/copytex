const COPYTEX_MENU_ID = "copytex-copy-latex";
const COPYTEX_DELIMITER_PARENT_ID = "copytex-display-delimiter";
const COPYTEX_DELIMITER_BRACKET_ID = "copytex-display-delimiter-bracket";
const COPYTEX_DELIMITER_DOLLAR_ID = "copytex-display-delimiter-dollar";
const COPYTEX_COPY_MESSAGE = "COPY_LATEX_FROM_CONTEXT_MENU";
const COPYTEX_CHATGPT_PATTERNS = ["https://chatgpt.com/*", "https://chat.openai.com/*"];
const COPYTEX_STORAGE_KEY = "displayDelimiter";
const COPYTEX_DEFAULT_DISPLAY_DELIMITER = "bracket";
const COPYTEX_DISPLAY_DELIMITER_BY_MENU_ID = {
  [COPYTEX_DELIMITER_BRACKET_ID]: "bracket",
  [COPYTEX_DELIMITER_DOLLAR_ID]: "dollar"
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.storage.sync.get(
      { [COPYTEX_STORAGE_KEY]: COPYTEX_DEFAULT_DISPLAY_DELIMITER },
      (items) => {
        createContextMenus(items[COPYTEX_STORAGE_KEY]);
      }
    );
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const displayDelimiter = COPYTEX_DISPLAY_DELIMITER_BY_MENU_ID[info.menuItemId];
  if (displayDelimiter) {
    chrome.storage.sync.set({ [COPYTEX_STORAGE_KEY]: displayDelimiter });
    return;
  }

  if (info.menuItemId !== COPYTEX_MENU_ID || !tab || typeof tab.id !== "number") {
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: COPYTEX_COPY_MESSAGE }, () => {
    if (chrome.runtime.lastError) {
      // The content script reports user-visible copy errors. This only avoids
      // noisy service-worker errors when the page is unavailable.
    }
  });
});

function createContextMenus(displayDelimiter) {
  const checkedDelimiter = isValidDisplayDelimiter(displayDelimiter)
    ? displayDelimiter
    : COPYTEX_DEFAULT_DISPLAY_DELIMITER;

  chrome.contextMenus.create({
    id: COPYTEX_MENU_ID,
    title: "Copy LaTeX source",
    contexts: ["page", "selection"],
    documentUrlPatterns: COPYTEX_CHATGPT_PATTERNS
  });

  chrome.contextMenus.create({
    id: COPYTEX_DELIMITER_PARENT_ID,
    title: "Block formula wrapper",
    contexts: ["page", "selection"],
    documentUrlPatterns: COPYTEX_CHATGPT_PATTERNS
  });

  chrome.contextMenus.create({
    id: COPYTEX_DELIMITER_BRACKET_ID,
    parentId: COPYTEX_DELIMITER_PARENT_ID,
    title: "\\[ ... \\]",
    type: "radio",
    checked: checkedDelimiter === "bracket",
    contexts: ["page", "selection"],
    documentUrlPatterns: COPYTEX_CHATGPT_PATTERNS
  });

  chrome.contextMenus.create({
    id: COPYTEX_DELIMITER_DOLLAR_ID,
    parentId: COPYTEX_DELIMITER_PARENT_ID,
    title: "$$ ... $$",
    type: "radio",
    checked: checkedDelimiter === "dollar",
    contexts: ["page", "selection"],
    documentUrlPatterns: COPYTEX_CHATGPT_PATTERNS
  });
}

function isValidDisplayDelimiter(value) {
  return value === "bracket" || value === "dollar";
}
