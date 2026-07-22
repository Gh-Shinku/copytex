import { writeText } from "./content/clipboard";
import { createFloatingButtonController } from "./content/floating-button";
import { createToastController } from "./content/toast";
import {
  formatOutputFormatLabel,
  DEFAULT_OUTPUT_FORMAT,
  normalizeOutputFormat,
  OUTPUT_FORMAT_STORAGE_KEY
} from "./shared/settings";
import type { ChatGptApi } from "./chatgpt";
import type { CopyResult, FormulaExtractionResult, OutputFormat } from "./shared/types";
import { extractorApi } from "./extractor";
import { selectionSerializerApi } from "./selection";

const COPY_MESSAGE = "COPY_LATEX_FROM_CONTEXT_MENU";
const CHATGPT_RESPONSE_COPY_SCAN_DELAY = 250;

interface RuntimeCopyMessage {
  type?: string;
}

const chatGptTools = (globalThis as typeof globalThis & {
  CopyTeXChatGPT?: ChatGptApi;
}).CopyTeXChatGPT;

if (!(globalThis as typeof globalThis & { __copyTeXContentLoaded?: boolean }).__copyTeXContentLoaded) {
  initCopyTeXContentScript();
}

function initCopyTeXContentScript(): void {
  (globalThis as typeof globalThis & { __copyTeXContentLoaded?: boolean }).__copyTeXContentLoaded =
    true;

  let activeFormula: Element | null = null;
  let contextFormula: Element | null = null;
  let outputFormat: OutputFormat = DEFAULT_OUTPUT_FORMAT;
  let chatGptObserver: MutationObserver | null = null;
  let chatGptScanTimer: number | null = null;

  const toast = createToastController({
    document,
    window,
    toastId: "copytex-toast"
  });
  const floatingButton = createFloatingButtonController({
    buttonId: "copytex-floating-button",
    document,
    window,
    onClick: () => copyFormula(activeFormula),
    onError: (message) => showToast(message, true),
    onHide: () => {
      activeFormula = null;
    }
  });

  document.addEventListener("pointerover", handlePointerOver, true);
  document.addEventListener("pointerout", handlePointerOut, true);
  document.addEventListener("contextmenu", handleContextMenu, true);
  document.addEventListener("copy", handleCopy, true);
  window.addEventListener("scroll", repositionFloatingButton, true);
  window.addEventListener("resize", repositionFloatingButton);
  markCurrentSite();
  loadOutputFormatPreference();
  listenForOutputFormatChanges();
  initChatGptResponseCopy();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isRuntimeCopyMessage(message) || message.type !== COPY_MESSAGE) {
      return false;
    }

    copyFormula(contextFormula)
      .then((response) => {
        if (!response.ok) {
          showToast(response.error || "Copy failed", true);
        }
        sendResponse(response);
      })
      .catch((error) => {
        const reason = errorMessage(error, "Copy failed");
        showToast(reason, true);
        sendResponse({ ok: false, error: reason });
      });

    return true;
  });

  function handlePointerOver(event: PointerEvent): void {
    if (floatingButton.containsTarget(event.target)) {
      floatingButton.clearHideTimer();
      return;
    }

    const formula = extractorApi.findFormulaElement(event.target);
    if (!formula || !extractorApi.extractLatexFromElement(formula)) {
      return;
    }

    activeFormula = formula;
    floatingButton.show(formula);
  }

  function handlePointerOut(event: PointerEvent): void {
    if (!activeFormula) {
      return;
    }

    const nextTarget = event.relatedTarget;
    if (contains(activeFormula, nextTarget) || floatingButton.containsTarget(nextTarget)) {
      return;
    }

    floatingButton.scheduleHide(() => {
      activeFormula = null;
    });
  }

  function handleContextMenu(event: MouseEvent): void {
    const formula = extractorApi.findFormulaElement(event.target);
    contextFormula = formula && extractorApi.extractLatexFromElement(formula) ? formula : null;
  }

  function handleCopy(event: ClipboardEvent): void {
    if (!event.clipboardData || !window.getSelection) {
      return;
    }

    const result = selectionSerializerApi.serializeSelectionToLatexText(
      window.getSelection(),
      extractorApi,
      { outputFormat }
    );

    if (!result.handled || !result.text) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    event.clipboardData.setData("text/plain", result.text);
    showToast(`Copied selection as ${formatOutputFormatLabel(outputFormat)}`);
  }

  function repositionFloatingButton(): void {
    if (activeFormula) {
      floatingButton.position(activeFormula);
    }
  }

  async function copyFormula(formula: Element | null): Promise<CopyResult> {
    const result = formula ? extractorApi.extractLatexFromElement(formula) : null;
    if (!result || !result.latex) {
      return { ok: false, error: "No formula source found" };
    }

    try {
      const text = selectionSerializerApi.formatFormula(result, { outputFormat });
      await writeText(text);
      showToast(`Copied formula as ${formatOutputFormatLabel(outputFormat)}`);
      return { ok: true, latex: result.latex, text };
    } catch (error) {
      const reason = errorMessage(error, "Copy failed");
      return { ok: false, error: reason };
    }
  }

  async function copyChatGptResponse(
    _nativeButton: Element,
    _copyTeXButton: Element,
    turn: Element | null
  ): Promise<CopyResult> {
    if (!turn || !chatGptTools) {
      showToast("CopyTeX response copy is unavailable", true);
      return { ok: false, error: "CopyTeX response copy is unavailable" };
    }

    try {
      const result = chatGptTools.serializeChatGptTurnToMarkdown(
        turn,
        extractorApi,
        selectionSerializerApi,
        { outputFormat }
      );
      if (!result.ok || !result.text) {
        throw new Error(result.error || "No response content found");
      }

      await writeText(result.text);
      showToast(`Copied response as ${formatOutputFormatLabel(outputFormat)}`);
      return { ok: true, text: result.text };
    } catch (error) {
      const reason = errorMessage(error, "Copy response failed");
      showToast(reason, true);
      return { ok: false, error: reason };
    }
  }

  function showToast(message: string, isError?: boolean): void {
    toast.show(message, isError);
  }

  function loadOutputFormatPreference(): void {
    if (!chrome.storage || !chrome.storage.sync) {
      return;
    }

    chrome.storage.sync.get(
      { [OUTPUT_FORMAT_STORAGE_KEY]: DEFAULT_OUTPUT_FORMAT },
      (items) => {
        outputFormat = normalizeOutputFormat(items[OUTPUT_FORMAT_STORAGE_KEY]);
      }
    );
  }

  function listenForOutputFormatChanges(): void {
    if (!chrome.storage || !chrome.storage.onChanged) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync" || !changes[OUTPUT_FORMAT_STORAGE_KEY]) {
        return;
      }

      outputFormat = normalizeOutputFormat(changes[OUTPUT_FORMAT_STORAGE_KEY].newValue);
    });
  }

  function markCurrentSite(): void {
    if (location.hostname === "chat.deepseek.com") {
      document.documentElement.dataset.copytexSite = "deepseek";
    }
  }

  function initChatGptResponseCopy(): void {
    if (!chatGptTools || !chatGptTools.isChatGptHost(location.hostname)) {
      return;
    }

    injectChatGptResponseCopyButtons();

    if (typeof MutationObserver !== "function") {
      return;
    }

    chatGptObserver = new MutationObserver(scheduleChatGptResponseCopyScan);
    chatGptObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function scheduleChatGptResponseCopyScan(): void {
    if (chatGptScanTimer) {
      return;
    }

    chatGptScanTimer = window.setTimeout(() => {
      chatGptScanTimer = null;
      injectChatGptResponseCopyButtons();
    }, CHATGPT_RESPONSE_COPY_SCAN_DELAY);
  }

  function injectChatGptResponseCopyButtons(): void {
    chatGptTools?.injectResponseCopyButtons(document, copyChatGptResponse);
  }

  void chatGptObserver;
}

function contains(parent: Node | null, child: EventTarget | null): boolean {
  return Boolean(parent && child instanceof Node && (parent === child || parent.contains(child)));
}

function errorMessage(error: unknown, fallback: string): string {
  return error && typeof error === "object" && "message" in error
    ? String(error.message || fallback)
    : fallback;
}

function isRuntimeCopyMessage(message: unknown): message is RuntimeCopyMessage {
  return Boolean(message && typeof message === "object");
}
