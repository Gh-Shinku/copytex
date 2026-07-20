const COPYTEX_MENU_ID = "copytex-copy-latex";
const COPYTEX_COPY_MESSAGE = "COPY_LATEX_FROM_CONTEXT_MENU";
const COPYTEX_SUPPORTED_PATTERNS = [
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://chat.deepseek.com/*"
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    createContextMenus();
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
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

function createContextMenus() {
  chrome.contextMenus.create({
    id: COPYTEX_MENU_ID,
    title: "Copy LaTeX source",
    contexts: ["page", "selection"],
    documentUrlPatterns: COPYTEX_SUPPORTED_PATTERNS
  });
}
